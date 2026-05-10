import * as vscode from 'vscode';
import type { ProviderId } from '../types';

/**
 * Manages API keys securely using VS Code's SecretStorage.
 * Keys are encrypted at rest via the OS credential manager.
 */
export class AuthService {
  private static readonly KEY_PREFIX = 'nopilot.apiKey.';
  private static readonly PROVIDER_IDS: ProviderId[] = [
    'vscode-lm',
    'anthropic',
    'openai',
    'gemini',
    'ollama',
  ];
  private readonly pendingLocalSecretChanges = new Map<string, number>();

  constructor(private readonly secrets: vscode.SecretStorage) {}

  /** Retrieve the stored API key for a provider */
  async getApiKey(providerId: string): Promise<string | undefined> {
    return this.secrets.get(AuthService.KEY_PREFIX + providerId);
  }

  /** Check if an API key exists for a provider */
  async hasApiKey(providerId: string): Promise<boolean> {
    const key = await this.getApiKey(providerId);
    return key !== undefined && key.length > 0;
  }

  /** Store an API key securely */
  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    const key = AuthService.KEY_PREFIX + providerId;
    this.trackLocalSecretChange(key);
    try {
      await this.secrets.store(key, apiKey);
    } catch (error) {
      this.releaseLocalSecretChange(key);
      throw error;
    }
  }

  /** Delete a stored API key */
  async removeApiKey(providerId: string): Promise<void> {
    const key = AuthService.KEY_PREFIX + providerId;
    this.trackLocalSecretChange(key);
    try {
      await this.secrets.delete(key);
    } catch (error) {
      this.releaseLocalSecretChange(key);
      throw error;
    }
  }

  /** Resolve a NoPilot provider ID from a changed SecretStorage key. */
  getProviderIdForSecretKey(key: string): ProviderId | undefined {
    if (!key.startsWith(AuthService.KEY_PREFIX)) {
      return undefined;
    }

    const providerId = key.slice(AuthService.KEY_PREFIX.length);
    return AuthService.PROVIDER_IDS.find((candidate) => candidate === providerId);
  }

  /** Return true when a secret change event was caused by this AuthService instance. */
  consumeLocalSecretChange(key: string): boolean {
    const count = this.pendingLocalSecretChanges.get(key) ?? 0;
    if (count <= 0) {
      return false;
    }

    if (count === 1) {
      this.pendingLocalSecretChanges.delete(key);
    } else {
      this.pendingLocalSecretChanges.set(key, count - 1);
    }

    return true;
  }

  private trackLocalSecretChange(key: string): void {
    this.pendingLocalSecretChanges.set(
      key,
      (this.pendingLocalSecretChanges.get(key) ?? 0) + 1
    );
  }

  private releaseLocalSecretChange(key: string): void {
    const count = this.pendingLocalSecretChanges.get(key) ?? 0;
    if (count <= 1) {
      this.pendingLocalSecretChanges.delete(key);
      return;
    }

    this.pendingLocalSecretChanges.set(key, count - 1);
  }

  /**
   * Prompt the user to enter an API key via an input box.
   * Returns the key if entered, undefined if cancelled.
   */
  async promptForApiKey(providerName: string): Promise<string | undefined> {
    const apiKey = await vscode.window.showInputBox({
      title: `${providerName} API Key`,
      prompt: `Enter your ${providerName} API key`,
      password: true,
      placeHolder: 'sk-...',
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'API key cannot be empty';
        }
        return undefined;
      },
    });

    return apiKey?.trim();
  }

  /** Listen for secret changes */
  onDidChange(listener: (e: vscode.SecretStorageChangeEvent) => void): vscode.Disposable {
    return this.secrets.onDidChange(listener);
  }
}
