import { mkdtemp, mkdir, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import esbuild from 'esbuild';

const executable = process.env.VSCODE_EXECUTABLE || '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
const root = await realpath(await mkdtemp(path.join(tmpdir(), 'nopilot-host-')));
const profile = path.join(root, 'profile');
const fixture = path.join(root, 'fixture-extension');
const workspace = path.join(root, 'workspace');
await Promise.all([mkdir(path.join(profile,'User'),{recursive:true}),mkdir(fixture),mkdir(workspace),mkdir(path.join(root,'extensions'))]);
await writeFile(path.join(profile,'User','settings.json'), JSON.stringify({
  'telemetry.telemetryLevel':'off','update.mode':'none','extensions.autoCheckUpdates':false,
  'extensions.autoUpdate':false,'workbench.enableExperiments':false,'security.workspace.trust.enabled':false,
  'git.enabled':false,'npm.autoDetect':'off','typescript.disableAutomaticTypeAcquisition':true,
  'workbench.startupEditor':'none', 'files.autoSave':'off',
}));
await writeFile(path.join(fixture,'package.json'), JSON.stringify({name:'nopilot-host-fixture',publisher:'nopilot-test',version:'0.0.1',engines:{vscode:'^1.90.0'},main:'extension.js'}));
await writeFile(path.join(fixture,'extension.js'),'exports.activate = () => {};');
await writeFile(path.join(workspace,'a.ts'),'one two three\n');
await writeFile(path.join(workspace,'b.ts'),'second file\n');
await writeFile(path.join(workspace,'package.json'),JSON.stringify({name:'fixture',version:'1.0.0',scripts:{test:'node -e "console.log(\'fixture-check\')"',build:'node -e "require(\'fs\').writeFileSync(\'command-ran\',\'yes\')"'}}));
await esbuild.build({entryPoints:['test/extensionHost.ts'],outfile:path.join(fixture,'tests.js'),bundle:true,platform:'node',format:'cjs',external:['vscode']});
console.log(`Isolated Extension Host artifacts: ${root}`);
const env={...process.env};
for(const key of Object.keys(env)){if(/TOKEN|SECRET|PASSWORD|API_KEY|ELECTRON_RUN_AS_NODE/.test(key)){delete env[key];}}
const child=spawn(executable,[workspace,'--extensionDevelopmentPath='+fixture,'--extensionTestsPath='+path.join(fixture,'tests.js'),
  '--user-data-dir='+profile,'--extensions-dir='+path.join(root,'extensions'),'--disable-extensions','--disable-workspace-trust','--skip-welcome','--skip-release-notes','--new-window'],{env,stdio:'inherit'});
const timer=setTimeout(()=>{child.kill('SIGTERM');},90_000);
child.on('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1;});
child.on('close',code=>{clearTimeout(timer);process.exitCode=code??1;});
