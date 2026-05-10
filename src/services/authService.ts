import * as vscode from 'vscode';

/**
 * Manages API keys securely using VS Code's SecretStorage.
 * Keys are encrypted at rest via the OS credential manager.
 */
export class AuthService {
  private static readonly KEY_PREFIX = 'nopilot.apiKey.';

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
    await this.secrets.store(AuthService.KEY_PREFIX + providerId, apiKey);
  }

  /** Delete a stored API key */
  async removeApiKey(providerId: string): Promise<void> {
    await this.secrets.delete(AuthService.KEY_PREFIX + providerId);
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
