import { Cancellation, CancelledError, cancellable, checkCancellation } from './cancellation';
import { AgentAction, AgentObservation, agentPrompt, parseAgentAction } from './protocol';

export interface ToolResult { text: string; stop?: boolean }
export interface AgentHost {
  complete(prompt: string): Promise<string>;
  execute(action: Exclude<AgentAction, { kind: 'done' }>): Promise<ToolResult>;
  progress(message: string): void;
}

export async function runAgent(task: string, workspace: string, host: AgentHost, token: Cancellation, maxSteps = 12): Promise<string> {
  const observations: AgentObservation[] = [];
  let failures = 0;
  let previous = '';
  let repeats = 0;
  for (let step = 1; step <= maxSteps; step++) {
    checkCancellation(token);
    const prompt = agentPrompt(task, observations, workspace);
    if (prompt.length > 100_000) { return 'Stopped at the context limit. Start a focused follow-up; applied edits remain available.'; }
    host.progress(`Step ${step}/${maxSteps}: requesting next action…`);
    // Provider failures end the run rather than spending more requests retrying a broken connection.
    const raw = await cancellable(host.complete(prompt), token);
    checkCancellation(token);
    let action: AgentAction | 'invalid' = 'invalid';
    try {
      action = parseAgentAction(raw);
      if (action.kind === 'done') { return action.message; }
      const key = JSON.stringify(action);
      repeats = key === previous ? repeats + 1 : 1;
      previous = key;
      if (repeats > 2) { return 'Stopped because the same action repeated without progress.'; }
      host.progress(`Step ${step}/${maxSteps}: ${action.kind}${'path' in action ? ` ${action.path}` : ''}`);
      const result = await host.execute(action);
      checkCancellation(token);
      host.progress(`${action.kind}: ${result.text.slice(0, 1200)}`);
      if (result.stop) { return result.text; }
      observations.push({ action, result: result.text.slice(0, 66_000) });
      failures = 0;
    } catch (error) {
      if (error instanceof CancelledError || token.isCancellationRequested) { throw new CancelledError(); }
      const message = error instanceof Error ? error.message : String(error);
      observations.push({ action, result: `ERROR: ${message}` });
      host.progress(`Action failed: ${message}`);
      if (++failures >= 3) { return `Stopped after three consecutive action failures. ${message}`; }
    }
  }
  return 'Stopped at the 12-step limit. Review applied changes and tool results before continuing.';
}
