import * as vscode from 'vscode';
import { chooseRepositoryIndex, collectRepositoryRootPaths } from './gitSelection';

/** Git extension API types (subset) */
interface GitExtension {
  getAPI(version: number): GitAPI;
}

interface GitAPI {
  repositories: Repository[];
}

interface Repository {
  inputBox: { value: string };
  rootUri?: vscode.Uri;
  diff(cached?: boolean): Promise<string>;
  state: {
    indexChanges: Change[];
    workingTreeChanges: Change[];
  };
}

interface Change {
  uri: vscode.Uri;
}

/**
 * Service for interacting with the built-in Git extension.
 * Extracts diffs for commit message generation.
 */
export class GitService {
  private gitApi: GitAPI | undefined;
  private lastRepository: Repository | undefined;

  /** Initialize by getting the Git extension API */
  async initialize(): Promise<boolean> {
    try {
      const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
      if (!gitExtension) {
        return false;
      }

      if (!gitExtension.isActive) {
        await gitExtension.activate();
      }

      this.gitApi = gitExtension.exports.getAPI(1);
      return true;
    } catch {
      return false;
    }
  }

  /** Get the most relevant repository for the active editor, with fallback to the first repo */
  private getRepository(activeUri?: vscode.Uri): Repository | undefined {
    const repositories = this.gitApi?.repositories;
    if (!repositories || repositories.length === 0) {
      return undefined;
    }

    const fileBackedRepositories = repositories.filter(
      (repository) => repository.rootUri?.scheme === 'file'
    );
    const activeFilePath = activeUri?.scheme === 'file' ? activeUri.fsPath : undefined;
    const repositoryCandidates =
      fileBackedRepositories.length > 0 ? fileBackedRepositories : repositories;
    const repositoryRoots = collectRepositoryRootPaths(repositoryCandidates);
    const repositoryIndex = repositoryRoots.length > 0
      ? chooseRepositoryIndex(repositoryRoots, activeFilePath)
      : 0;
    const repository = repositoryCandidates[repositoryIndex] || repositoryCandidates[0];
    this.lastRepository = repository;
    return repository;
  }

  /**
   * Get the diff for staged changes. If nothing is staged,
   * falls back to unstaged (working tree) changes.
   */
  async getDiff(): Promise<string> {
    const repo = this.getRepository(vscode.window.activeTextEditor?.document.uri);
    if (!repo) {
      throw new Error('No Git repository found. Please open a folder with a Git repository.');
    }

    // Try staged changes first
    if (repo.state.indexChanges.length > 0) {
      return repo.diff(true); // cached = staged
    }

    // Fall back to unstaged changes
    if (repo.state.workingTreeChanges.length > 0) {
      return repo.diff(false);
    }

    throw new Error('No changes detected. Stage or modify some files first.');
  }

  /** Set the commit message in the SCM input box */
  setCommitMessage(message: string): void {
    const repo = this.lastRepository || this.getRepository(vscode.window.activeTextEditor?.document.uri);
    if (repo) {
      repo.inputBox.value = message;
    }
  }

  /** Check if Git extension is available */
  isAvailable(): boolean {
    return this.gitApi !== undefined && this.gitApi.repositories.length > 0;
  }
}
