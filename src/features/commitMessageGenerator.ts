import * as vscode from 'vscode';
import { ProviderManager } from '../providers/providerManager';
import { GitService } from '../services/gitService';
import { CommitMessageRequest } from '../types';

/**
 * Handles commit message generation via the active AI provider.
 * Integrates with the SCM panel — button in the title bar
 * and writes the result to the Git input box.
 */
export class CommitMessageGenerator {
  constructor(
    private readonly providerManager: ProviderManager,
    private readonly gitService: GitService
  ) {}

  /** Generate a commit message and fill the SCM input box */
  async generate(): Promise<void> {
    // Check Git availability
    if (!this.gitService.isAvailable()) {
      const ok = await this.gitService.initialize();
      if (!ok) {
        vscode.window.showErrorMessage(
          'NoPilot: Git extension not found. Please open a folder with a Git repository.'
        );
        return;
      }
    }

    // Get the diff
    let diff: string;
    try {
      diff = await this.gitService.getDiff();
    } catch (error) {
      vscode.window.showWarningMessage(
        `NoPilot: ${error instanceof Error ? error.message : 'Failed to get diff'}`
      );
      return;
    }

    if (!diff || diff.trim().length === 0) {
      vscode.window.showWarningMessage(
        'NoPilot: No changes detected. Stage or modify some files first.'
      );
      return;
    }

    // Truncate very large diffs to avoid token limits
    const maxDiffLength = 8000;
    if (diff.length > maxDiffLength) {
      diff = diff.substring(0, maxDiffLength) + '\n\n... (diff truncated)';
    }

    // Read config
    const config = vscode.workspace.getConfiguration('nopilot.commitMessage');
    const language = config.get<string>('language', 'en');
    const format = config.get<'conventional' | 'simple'>('format', 'conventional');

    const request: CommitMessageRequest = { diff, language, format };

    // Show progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.SourceControl,
        title: 'NoPilot: Generating commit message...',
      },
      async () => {
        try {
          const cts = new vscode.CancellationTokenSource();
          const message = await this.providerManager.generateCommitMessage(
            request,
            cts.token
          );

          if (message) {
            this.gitService.setCommitMessage(message);
            // Show subtle notification
            vscode.window.setStatusBarMessage('$(sparkle) Commit message generated', 3000);
          }

          cts.dispose();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(
            `NoPilot: Failed to generate commit message — ${errorMessage}`
          );
        }
      }
    );
  }
}
