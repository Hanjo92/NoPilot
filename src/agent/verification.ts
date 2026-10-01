import { spawn } from 'node:child_process';
import { Cancellation, CancelledError, checkCancellation } from './cancellation';
import { VerificationScript } from './protocol';

export interface VerificationPlan {
  cwd: string;
  script: VerificationScript;
  body: string;
  packageText: string;
}

export function verificationPlan(cwd: string, packageText: string, script: VerificationScript): VerificationPlan {
  if (!['test', 'lint', 'compile', 'build'].includes(script)) { throw new Error('Unsupported verification script.'); }
  const manifest = JSON.parse(packageText);
  const body: unknown = manifest?.scripts?.[script];
  if (typeof body !== 'string' || !body.trim() || body.length > 8000) { throw new Error(`No supported package.json script: ${script}`); }
  return { cwd, script, body, packageText };
}

/** Caller must obtain approval for this exact plan immediately before executing it. */
export function executeVerification(plan: VerificationPlan, token: Cancellation, timeoutMs = 120_000): Promise<string> {
  checkCancellation(token);
  if (process.platform === 'win32') { throw new Error('Command verification is currently supported on macOS/Linux only.'); }
  return new Promise((resolve, reject) => {
    // No model-supplied shell command or arguments. npm still runs the approved project script.
    const child = spawn('npm', ['--ignore-scripts', 'run', plan.script], {
      cwd: plan.cwd, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let truncated = false;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const killGroup = (signal: NodeJS.Signals) => {
      if (child.pid) { try { process.kill(-child.pid, signal); } catch { /* Already exited. */ } }
    };
    const stop = () => {
      killGroup('SIGTERM');
      killTimer ??= setTimeout(() => killGroup('SIGKILL'), 1000);
    };
    const listener = token.onCancellationRequested(stop);
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const append = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (output.length + text.length > 16000) { truncated = true; }
      output = (output + text).slice(0, 16000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer) { clearTimeout(killTimer); }
      listener.dispose();
      // Scripts may leave background children behind; do not leave an agent process group running.
      killGroup('SIGKILL');
    };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', (code, signal) => {
      cleanup();
      if (token.isCancellationRequested) { reject(new CancelledError()); return; }
      resolve(`npm --ignore-scripts run ${plan.script}\nExit code: ${code ?? 'none'}; signal: ${signal ?? 'none'}${timedOut ? '; timed out' : ''}\n${output}${truncated ? '\n[Output truncated]' : ''}`);
    });
    if (token.isCancellationRequested) { stop(); }
  });
}
