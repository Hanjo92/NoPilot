import assert from 'node:assert/strict';
import test from 'node:test';
import { cancellable } from './cancellation';
import { parseAgentAction } from './protocol';
import { runAgent } from './runner';
import { cancellationSource } from './testSupport';

test('strict protocol rejects arbitrary shell, malformed JSON, oversized fields and ambiguous edit sets', () => {
  for (const value of ['explanation', '{"kind":"shell","command":"rm -rf /"}', '{"kind":"verify","script":"deploy"}',
    JSON.stringify({kind:'read',path:'x'.repeat(501)}), JSON.stringify({kind:'patch',summary:'x',edits:[]})]) {
    assert.throws(() => parseAgentAction(value));
  }
  assert.deepEqual(parseAgentAction('```json\n{"kind":"done","message":"Finished"}\n```'), {kind:'done',message:'Finished'});
});

test('tool and verification results feed the next model turn before finishing', async () => {
  let calls = 0;
  const result = await runAgent('fix it', 'repo', {
    complete: async prompt => {
      calls++;
      if (calls === 1) { return '{"kind":"read","path":"a.ts"}'; }
      assert.match(prompt, /actual file content/);
      if (calls === 2) { return '{"kind":"verify","script":"test"}'; }
      assert.match(prompt, /Exit code: 1/);
      return '{"kind":"done","message":"Verification failed; needs follow-up."}';
    },
    execute: async action => ({ text: action.kind === 'read' ? 'actual file content' : 'Exit code: 1' }),
    progress: () => {},
  }, cancellationSource().token);
  assert.match(result, /Verification failed/); assert.equal(calls, 3);
});

test('tool failure is reported to the model and repeated failures stop after three calls', async () => {
  let calls = 0;
  const result = await runAgent('task', 'repo', {
    complete: async prompt => { calls++; if (calls > 1) { assert.match(prompt, /outside root/); } return JSON.stringify({kind:'read',path:`${calls}.ts`}); },
    execute: async () => { throw new Error('outside root'); }, progress: () => {},
  }, cancellationSource().token);
  assert.match(result, /three consecutive/); assert.equal(calls, 3);
});

test('declined approval stops immediately without requesting another action', async () => {
  let calls = 0;
  const result = await runAgent('task', 'repo', {
    complete: async () => { calls++; return '{"kind":"verify","script":"test"}'; },
    execute: async () => ({text:'Declined',stop:true}), progress: () => {},
  }, cancellationSource().token);
  assert.equal(result, 'Declined'); assert.equal(calls, 1);
});

test('repeated identical actions and hard iteration limit both stop boundedly', async () => {
  for (const repeat of [true, false]) {
    let calls = 0; let tools = 0;
    const result = await runAgent('task', 'repo', {
      complete: async () => JSON.stringify({kind:'read',path:`${repeat ? 'a' : calls++}.ts`}),
      execute: async () => { tools++; return {text:'ok'}; }, progress: () => {},
    }, cancellationSource().token);
    assert.equal(tools, repeat ? 2 : 12); assert.match(result, repeat ? /repeated/ : /12-step limit/);
  }
});

test('cancelling an unresponsive provider releases the run and ignores a late tool request', async () => {
  const source = cancellationSource(); let finish!: (text: string) => void; let tools = 0;
  const result = runAgent('task', 'repo', {
    complete: () => new Promise(resolve => { finish = resolve; }),
    execute: async () => { tools++; return {text:'bad'}; }, progress: () => {},
  }, source.token);
  source.cancel();
  await assert.rejects(result, /Cancelled/);
  finish('{"kind":"verify","script":"test"}');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(tools, 0);
});

test('cancellation during tool execution prevents the next model request', async () => {
  const source = cancellationSource(); let calls = 0;
  await assert.rejects(runAgent('task', 'repo', {
    complete: async () => { calls++; return '{"kind":"list","query":""}'; },
    execute: async () => { source.cancel(); return {text:'ok'}; }, progress: () => {},
  }, source.token), /Cancelled/);
  assert.equal(calls, 1);
});

test('bounded wait times out unresponsive work without executing a fallback', async () => {
  await assert.rejects(cancellable(new Promise(() => {}), cancellationSource().token, 10), /timed out/);
});
