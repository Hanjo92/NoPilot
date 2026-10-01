import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { DocumentSnapshot } from './editSafety';
import { WorkspaceScope, validateRelativePath } from './workspaceScope';
import { WorkspaceTools } from './workspaceTools';
import { cancellationSource } from './testSupport';

async function fixture(t: test.TestContext) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nopilot-tools-')));
  t.after(() => fs.rm(root, {recursive:true,force:true}));
  await fs.writeFile(path.join(root, 'a.ts'), 'first value');
  await fs.writeFile(path.join(root, 'b.ts'), 'second value');
  return {root,scope:await WorkspaceScope.create(root)};
}

test('relative path policy rejects traversal, absolute/Windows paths, hidden and dependency files', () => {
  for (const file of ['../x','src/../../x','/tmp/x','C:\\x','src\\x','.env','.git/config','src/.secret', 'node_modules/a.ts','src/a.key','a\0b','a//b']) {
    assert.throws(() => validateRelativePath(file), /Path must/, file);
  }
  assert.deepEqual(validateRelativePath('src/main.ts'), ['src','main.ts']);
});

test('file tools reject file and directory symlinks and bound large files', async t => {
  const {root,scope} = await fixture(t);
  await fs.symlink(path.join(root,'a.ts'),path.join(root,'link.ts'));
  await fs.symlink(os.tmpdir(),path.join(root,'linked'));
  await fs.writeFile(path.join(root,'large.txt'),'x'.repeat(65537));
  await assert.rejects(scope.resolve('link.ts'), /Symlinks/);
  await assert.rejects(scope.resolve('linked/outside'), /Symlinks/);
  await assert.rejects(scope.resolve('large.txt'), /64 KiB/);
  const list = await scope.list('',cancellationSource().token);
  assert.ok(!list.paths.includes('link.ts'));
  assert.ok(!list.paths.some(p=>p.startsWith('linked/')));
});

test('multi-file tool changes require prior reads, fresh versions, one approval and fresh reads after apply', async t => {
  const {root,scope} = await fixture(t);
  const documents = new Map<string,DocumentSnapshot>();
  for (const file of ['a.ts','b.ts']) {
    const absolute = path.join(root,file);
    documents.set(absolute,{uri:`file://${absolute}`,version:1,text:await fs.readFile(absolute,'utf8')});
  }
  let reviews = 0;
  const tools = new WorkspaceTools(scope, {
    read: async absolute => documents.get(absolute)!,
    review: async (edits,_summary,validate) => {
      await validate(); reviews++; assert.equal(edits.length,2);
      for (const edit of edits) { const key = path.join(root,edit.label); documents.set(key,{...edit.before,version:2,text:edit.after}); }
      return true;
    },
    verify: async (_script,applied) => ({text:`verified ${applied.size} files`}),
  },cancellationSource().token);
  const patch = {kind:'patch' as const,summary:'rename',edits:[{path:'a.ts',oldText:'first',newText:'FIRST'},{path:'b.ts',oldText:'second',newText:'SECOND'}]};
  await assert.rejects(tools.execute(patch),/Read a.ts/);
  await tools.execute({kind:'read',path:'a.ts'});
  await tools.execute({kind:'read',path:'b.ts'});
  assert.match((await tools.execute(patch)).text,/Applied to editor buffers/);
  assert.equal(reviews,1);
  assert.equal(documents.get(path.join(root,'a.ts'))!.text,'FIRST value');
  await assert.rejects(tools.execute(patch),/Read a.ts/);
  assert.equal((await tools.execute({kind:'verify',script:'test'})).text,'verified 2 files');
  // All writes above were simulated buffers; original disk remains unchanged until an approved save.
  assert.equal(await fs.readFile(path.join(root,'a.ts'),'utf8'),'first value');
});

test('a changed read snapshot or replaced symlink rejects patch before review', async t => {
  const {root,scope}=await fixture(t); let version=1; let reviews=0;
  const tools=new WorkspaceTools(scope,{
    read:async absolute=>({uri:absolute,version,text:'first value'}),
    review:async()=>{reviews++;return true;},verify:async()=>({text:'unused'}),
  },cancellationSource().token);
  await tools.execute({kind:'read',path:'a.ts'}); version++;
  const patch={kind:'patch' as const,summary:'test',edits:[{path:'a.ts',oldText:'first',newText:'new'}]};
  await assert.rejects(tools.execute(patch),/original document changed/);
  await fs.unlink(path.join(root,'a.ts'));
  await fs.symlink(path.join(root,'b.ts'),path.join(root,'a.ts'));
  await assert.rejects(tools.execute(patch),/Symlinks/);
  assert.equal(reviews,0);
});

test('search treats query as literal text and records limitations; cancelled searches do not read',async t=>{
  const {root,scope}=await fixture(t);const source=cancellationSource();let reads=0;
  const tools=new WorkspaceTools(scope,{
    read:async absolute=>{reads++;return {uri:absolute,version:1,text:await fs.readFile(absolute,'utf8')};},
    review:async()=>false,verify:async()=>({text:'unused'}),
  },source.token);
  const result=JSON.parse((await tools.execute({kind:'search',query:'value'})).text);
  assert.equal(result.matches.length,2); assert.equal(result.truncated,false);
  assert.equal(JSON.parse((await tools.execute({kind:'search',query:'.*'})).text).matches.length,0);
  source.cancel();const count=reads;
  await assert.rejects(tools.execute({kind:'search',query:'value'}),/Cancelled/);assert.equal(reads,count);
  assert.ok(root);
});
