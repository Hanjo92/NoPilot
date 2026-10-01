import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { executeVerification, verificationPlan } from './verification';
import { cancellationSource } from './testSupport';

async function fixture(t:test.TestContext,scripts:Record<string,string>) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nopilot-verify-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const manifest=JSON.stringify({name:'local-test-fixture',version:'1.0.0',scripts});
  await fs.writeFile(path.join(root,'package.json'),manifest);
  return verificationPlan(root,manifest,'test');
}

test('verification uses a fixed script name and captures the exact script shown for approval',()=>{
  const plan=verificationPlan('/repo','{"scripts":{"test":"node tests.js"}}','test');
  assert.equal(plan.body,'node tests.js');
  assert.throws(()=>verificationPlan('/repo','{"scripts":{}}','test'),/No supported/);
  assert.throws(()=>verificationPlan('/repo','{}','test; echo bad' as 'test'),/Unsupported/);
});

test('local verification returns failing exit code/output and skips npm pre/post hooks',async t=>{
  const plan=await fixture(t,{
    pretest:'node -e "process.exit(90)"', test:'node -e "console.log(\'fixture failure\'); process.exit(7)"',
    posttest:'node -e "process.exit(91)"',
  });
  const result=await executeVerification(plan,cancellationSource().token);
  assert.match(result,/Exit code: 7/);assert.match(result,/fixture failure/);
});

test('verification output is bounded and a runaway process times out',async t=>{
  const plan=await fixture(t,{test:'node -e "console.log(\'x\'.repeat(20000)); setInterval(()=>{},100)"'});
  const result=await executeVerification(plan,cancellationSource().token,1000);
  assert.match(result,/timed out/);assert.match(result,/Output truncated/);assert.ok(result.length<17000);
});

test('cancellation before or during verification cannot return a success result',async t=>{
  const plan=await fixture(t,{test:'node -e "setInterval(()=>{},100)"'});
  const source=cancellationSource(); const run=executeVerification(plan,source.token);
  setTimeout(()=>source.cancel(),150);
  await assert.rejects(run,/Cancelled/);
  assert.throws(()=>executeVerification(plan,source.token),/Cancelled/);
});
