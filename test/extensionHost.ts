import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { EditReview, snapshot } from '../src/agent/editReview';
import { responseEdit } from '../src/agent/editSafety';
import { NoPilotChatViewProvider } from '../src/ui/chatView';
import { WorkspaceScope } from '../src/agent/workspaceScope';
import { createWorkspaceTools } from '../src/agent/vscodeAgentHost';
import { runAgent } from '../src/agent/runner';

/** Runs only in a disposable Extension Host workspace, with model calls replaced by fixtures. */
export async function run(): Promise<void> {
  const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
  assert.match(root, /nopilot-host-/);
  const a = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, 'a.ts')));
  const b = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, 'b.ts')));
  const originalA = a.getText(); const originalB = b.getText();
  let confirmations = 0;
  const review = new EditReview({confirm:async (_message,_options,action)=>{confirmations++;return action;}});
  const event = new vscode.EventEmitter<void>();
  const requests: any[]=[];
  let finish!: (value:{text:string})=>void;
  const provider: any = {
    onDidChangeProvider:event.event,onDidChangeProviderState:event.event,
    getActiveProviderId:()=> 'openai',getActiveProvider:()=>({info:{currentModel:'fixture',description:'local fixture'}}),
    getActiveDisplayName:()=> 'Fixture',
    complete:(request:any)=>{requests.push(request);return new Promise(resolve=>{finish=resolve;});},
  };
  const chat: any = new NoPilotChatViewProvider(provider,review);
  try {
    await chat.show();
    let editor=await vscode.window.showTextDocument(a);
    editor.selection=new vscode.Selection(0,4,0,7);
    chat.chatMode='ask';
    chat.messages.push({id:'old-agent',role:'assistant',mode:'agent',content:'PRIVATE_AGENT_CONTEXT'});
    const response=chat.submitChat('replace the selection');
    await vscode.window.showTextDocument(b);
    finish({text:'```ts\nNEW\n```'}); await response;
    assert.equal(requests[0].workspaceContext,undefined);
    assert.ok(!JSON.stringify(requests[0]).includes('PRIVATE_AGENT_CONTEXT'));
    await chat.applyResponse({command:'applyResponse',messageId:'assistant-1',mode:'replace'});
    assert.equal(a.getText(),'one NEW three\n'); assert.equal(b.getText(),originalB);
    assert.equal(confirmations,2);
    console.log('HOST PASS: request URI/selection pinned despite editor switch; Ask context isolated; real diff and buffer edit');

    editor=await vscode.window.showTextDocument(a);editor.selection=new vscode.Selection(0,4,0,7);
    const next=chat.submitChat('another change');
    await editor.edit(builder=>builder.insert(new vscode.Position(0,0),'user '));
    finish({text:'BAD'});await next;
    const before=a.getText(); await chat.applyResponse({command:'applyResponse',messageId:'assistant-2',mode:'replace'});
    assert.equal(a.getText(),before);assert.match(chat.errorMessage,/original document changed/);
    console.log('HOST PASS: stale document rejected before approval');

    editor=await vscode.window.showTextDocument(a);
    const pending=chat.submitChat('cancel me');
    chat.cancellation.cancel(); await pending;
    finish({text:'LATE'}); await new Promise(resolve=>setImmediate(resolve));
    assert.equal(chat.messages.find((entry:any)=>entry.id==='assistant-3').canApply,undefined);
    assert.match(chat.messages.find((entry:any)=>entry.id==='assistant-3').content,/Cancelled/);
    console.log('HOST PASS: late model result ignored after cancellation');
  } finally { chat.dispose();review.dispose();event.dispose(); }

  const token=new vscode.CancellationTokenSource();
  let changed=false;
  const staleReview=new EditReview({confirm:async (_message,_options,action)=>{
    if(action==='Apply Changes') {
      const edit=new vscode.WorkspaceEdit();edit.insert(b.uri,new vscode.Position(0,0),'user ');
      await vscode.workspace.applyEdit(edit);changed=true;
    }
    return action;
  }});
  try {
    const beforeA=a.getText(); const beforeB=b.getText();
    const proposals=[a,b].map(doc=>responseEdit({...snapshot(doc),start:0,end:3,cursor:3},'BAD','replace'));
    await assert.rejects(staleReview.apply(proposals,token.token,'Conflict test'),/original document changed/);
    assert.ok(changed);assert.equal(a.getText(),beforeA);assert.equal(b.getText(),'user '+beforeB);
    console.log('HOST PASS: concurrent change rejects an entire multi-file proposal');
  } finally { staleReview.dispose(); }

  const cancelReview=new EditReview({confirm:async (_message,_options,action)=>{token.cancel();return action;}});
  try {
    const before=a.getText();
    await assert.rejects(cancelReview.apply([responseEdit({...snapshot(a),start:0,end:3,cursor:3},'BAD','replace')],token.token,'Cancel test'),/Cancelled/);
    assert.equal(a.getText(),before);
    console.log('HOST PASS: cancelling review prevents apply');
  } finally {cancelReview.dispose();token.dispose();}

  // Reset only the disposable fixture files, then exercise real tools, saving and local npm verification.
  const reset=new vscode.WorkspaceEdit();
  for (const [doc,text] of [[a,originalA],[b,originalB]] as const) {
    reset.replace(doc.uri,new vscode.Range(doc.positionAt(0),doc.positionAt(doc.getText().length)),text);
  }
  await vscode.workspace.applyEdit(reset);await a.save();await b.save();
  const approvedReview=new EditReview({confirm:async (_m,_o,action)=>action});
  const source=new vscode.CancellationTokenSource();
  const scope=await WorkspaceScope.create(root);
  let commandApprovals=0;
  const tools=createWorkspaceTools(scope,approvedReview,source.token,{confirm:async (_message,options,action)=>{
    assert.match(options.detail!,/not sandboxed/);assert.match(options.detail!,/fixture-check/);
    assert.match(options.detail!,/a.ts/);assert.match(options.detail!,/b.ts/);
    commandApprovals++;return action;
  }});
  try {
    const actions=[{kind:'read',path:'a.ts'},{kind:'read',path:'b.ts'},
      {kind:'patch',summary:'Update two fixtures',edits:[{path:'a.ts',oldText:'one',newText:'ONE'},{path:'b.ts',oldText:'second',newText:'SECOND'}]},
      {kind:'verify',script:'test'},{kind:'done',message:'Verified fixture changes'}];
    let step=0;
    const result=await runAgent('update fixtures', 'fixture', {
      complete:async prompt=>{
        if(step===4){assert.match(prompt,/Exit code: 0/);assert.match(prompt,/fixture-check/);}
        return JSON.stringify(actions[step++]);
      },execute:action=>tools.execute(action),progress:()=>{},
    },source.token);
    assert.equal(result,'Verified fixture changes');assert.equal(commandApprovals,1);
    assert.equal(await fs.readFile(a.uri.fsPath,'utf8'),'ONE two three\n');
    assert.equal(await fs.readFile(b.uri.fsPath,'utf8'),'SECOND file\n');
    console.log('HOST PASS: read → two-file approved patch → approved save/npm test → verification result to model');

    const marker=path.join(root,'command-ran');
    const denied=createWorkspaceTools(scope,approvedReview,source.token,{confirm:async()=>undefined});
    const rejected=await denied.execute({kind:'verify',script:'build'});
    assert.equal(rejected.stop,true);await assert.rejects(fs.access(marker));
    console.log('HOST PASS: denied verification never runs the command');

    const packageDocument=await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root,'package.json')));
    const packageOriginal=packageDocument.getText();
    const changedScript=createWorkspaceTools(scope,approvedReview,source.token,{confirm:async (_m,_o,action)=>{
      const change=new vscode.WorkspaceEdit();change.insert(packageDocument.uri,new vscode.Position(0,0),' ');
      await vscode.workspace.applyEdit(change);return action;
    }});
    await assert.rejects(changedScript.execute({kind:'verify',script:'build'}),/original document changed/);
    await assert.rejects(fs.access(marker));
    const restore=new vscode.WorkspaceEdit();
    restore.replace(packageDocument.uri,new vscode.Range(packageDocument.positionAt(0),packageDocument.positionAt(packageDocument.getText().length)),packageOriginal);
    await vscode.workspace.applyEdit(restore);await packageDocument.save();
    console.log('HOST PASS: changing package.json during command approval prevents execution');

    const editor=await vscode.window.showTextDocument(b);
    await editor.edit(builder=>builder.insert(new vscode.Position(0,0),'user '));
    let prompts=0;
    const userEdits=createWorkspaceTools(scope,approvedReview,source.token,{confirm:async (_m,_o,action)=>{prompts++;return action;}});
    await assert.rejects(userEdits.execute({kind:'verify',script:'build'}),/Save your existing edits/);
    assert.equal(prompts,0);await assert.rejects(fs.access(marker));
    console.log('HOST PASS: existing user edits are never auto-saved for verification');

    const alias=path.join(root,'alias-a.ts');await fs.symlink(a.uri.fsPath,alias);
    const aliasDocument=await vscode.workspace.openTextDocument(vscode.Uri.file(alias));
    assert.notEqual(aliasDocument.uri.toString(),a.uri.toString());
    await assert.rejects(userEdits.execute({kind:'read',path:'a.ts'}),/already open through another path/);
    console.log('HOST PASS: duplicate document path aliases cannot bypass buffer checks');
  } finally {approvedReview.dispose();source.dispose();}
  console.log('HOST RESULT: 10 integration scenarios passed; no external provider requests');
}
