import * as vscode from 'vscode';

/** Shared output channel for NoPilot extension logging */
let _outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!_outputChannel) {
    _outputChannel = vscode.window.createOutputChannel('NoPilot');
  }
  return _outputChannel;
}

export function log(message: string): void {
  const timestamp = new Date().toLocaleTimeString();
  getOutputChannel().appendLine(`[${timestamp}] ${message}`);
}

export function logError(message: string, error: unknown): void {
  const timestamp = new Date().toLocaleTimeString();
  const errorMsg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? `\n${error.stack}` : '';
  getOutputChannel().appendLine(`[${timestamp}] ❌ ${message}: ${errorMsg}${stack}`);
}
