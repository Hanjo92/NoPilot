import * as vscode from 'vscode';
import { ProviderManager } from '../providers/providerManager';
import { CompletionRequest } from '../types';
import { log, logError } from '../utils/logger';
import {
  buildInlineCacheScope,
  extractReferencedWords,
  getInlineRequestPolicy,
  getInlineStopSequences,
  sliceLines,
  stripMarkdownCodeFences,
  trimSingleLineCompletion,
} from './inlineText';
import {
  COPILOT_EXTENSION_ID,
  isCopilotEnabledForLanguage,
  shouldSkipNoPilotAutomaticInline,
} from './copilotDetection';

/**
 * Inline completion provider that uses the active AI provider
 * to suggest code as the user types (ghost text / gray suggestions).
 */
export class NoPilotInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private requestCounter = 0; // Track which request is "current"
  private enabled: boolean;
  private pauseWhenCopilotActive: boolean;
  private debounceMs: number;
  private maxPrefixLines: number;
  private maxSuffixLines: number;
  private disposables: vscode.Disposable[] = [];

  // LRU Cache for instant responses
  private cache = new Map<string, string>();
  private cacheKeys: string[] = [];
  private readonly MAX_CACHE_SIZE = 50;

  constructor(private readonly providerManager: ProviderManager) {
    const config = vscode.workspace.getConfiguration('nopilot');
    this.enabled = config.get('inline.enabled', true);
    this.pauseWhenCopilotActive = config.get('inline.pauseWhenCopilotActive', true);
    this.debounceMs = config.get('inline.debounceMs', 300);
    this.maxPrefixLines = config.get('inline.maxPrefixLines', 50);
    this.maxSuffixLines = config.get('inline.maxSuffixLines', 20);

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('nopilot.inline')) {
          const cfg = vscode.workspace.getConfiguration('nopilot');
          this.enabled = cfg.get('inline.enabled', true);
          this.pauseWhenCopilotActive = cfg.get('inline.pauseWhenCopilotActive', true);
          this.debounceMs = cfg.get('inline.debounceMs', 300);
          this.maxPrefixLines = cfg.get('inline.maxPrefixLines', 50);
          this.maxSuffixLines = cfg.get('inline.maxSuffixLines', 20);
        }
      })
    );
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (!this.enabled) {
      return undefined;
    }

    if (this.shouldSkipAutomaticRequestForCopilot(document.languageId, context.triggerKind)) {
      return undefined;
    }

    const currentLine = document.lineAt(position.line).text;
    const requestPolicy = getInlineRequestPolicy({
      isAutomaticTrigger:
        context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic,
      lineText: currentLine,
      cursorCharacter: position.character,
    });
    const activeProvider = this.providerManager.getActiveProvider();
    const cacheScope = buildInlineCacheScope(
      this.providerManager.getActiveProviderId(),
      activeProvider.info.currentModel
    );

    if (requestPolicy.skip) {
      return undefined;
    }

    const cachePrefixLines = Math.min(this.maxPrefixLines, requestPolicy.maxPrefixLines ?? this.maxPrefixLines);
    const cacheSuffixLines = Math.min(this.maxSuffixLines, requestPolicy.maxSuffixLines ?? this.maxSuffixLines);

    // Try to serve from cache first (0ms latency, bypass debounce)
    const prefixRange = new vscode.Range(
      Math.max(0, position.line - cachePrefixLines),
      0,
      position.line,
      position.character
    );
    const suffixRange = new vscode.Range(
      position.line,
      position.character,
      Math.min(document.lineCount - 1, position.line + cacheSuffixLines),
      0
    );
    const cacheKey = `${cacheScope}|${document.uri.toString()}|${document.getText(prefixRange)}|${document.getText(suffixRange)}`;

    if (this.cache.has(cacheKey)) {
      const cachedText = this.cache.get(cacheKey)!;
      log(`Inline Cache Hit: ✅ ${cachedText.length} chars (instant)`);
      return [new vscode.InlineCompletionItem(cachedText, new vscode.Range(position, position))];
    }

    // Assign a unique ID to this request
    const requestId = ++this.requestCounter;

    // Debounce — wait for user to stop typing
    const wasCancelled = await this.debounce(token);
    if (wasCancelled || token.isCancellationRequested) {
      return undefined;
    }

    // If a newer request came in during debounce, abandon this one
    if (requestId !== this.requestCounter) {
      return undefined;
    }

    const buildStart = Date.now();
    const request = await this.buildRequest(document, position, requestPolicy, context.triggerKind);
    const buildDurationMs = Date.now() - buildStart;
    log(
      `Inline request #${requestId}: ${request.filename} (${request.language}), line ${position.line + 1}, prefix ${request.prefix.length} chars, build ${buildDurationMs}ms`
    );

    try {
      // Use VS Code's own cancellation token directly
      // Don't add our own cancellation — let the API call finish
      const providerStart = Date.now();
      const response = await this.providerManager.complete(request, token);
      const providerDurationMs = Date.now() - providerStart;

      // Check AFTER the API call if this request is still current
      if (requestId !== this.requestCounter) {
        log(
          `Inline #${requestId}: response arrived after ${providerDurationMs}ms but newer request exists, discarding`
        );
        return undefined;
      }

      if (token.isCancellationRequested) {
        log(`Inline #${requestId}: cancelled by VS Code`);
        return undefined;
      }

      if (!response.text) {
        log(`Inline #${requestId}: empty response`);
        return undefined;
      }

      const cleanedText = this.cleanResponseText(
        response.text,
        request.prefix,
        request.suffix,
        request.stopSequences
      );

      if (!cleanedText) {
        log(`Inline #${requestId}: empty after cleanup`);
        return undefined;
      }

      log(
        `Inline #${requestId}: ✅ ${cleanedText.length} chars | provider ${providerDurationMs}ms | mode ${request.mode || 'explicit'}`
      );

      // Save to cache
      this.cache.set(cacheKey, cleanedText);
      this.cacheKeys.push(cacheKey);
      if (this.cacheKeys.length > this.MAX_CACHE_SIZE) {
        const oldest = this.cacheKeys.shift();
        if (oldest) this.cache.delete(oldest);
      }

      return [
        new vscode.InlineCompletionItem(
          cleanedText,
          new vscode.Range(position, position)
        ),
      ];
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes('cancelled') ||
        error.message.includes('abort') ||
        error.name === 'AbortError'
      )) {
        return undefined;
      }
      logError(`Inline #${requestId} failed`, error);
      return undefined;
    }
  }

  private async buildRequest(
    document: vscode.TextDocument,
    position: vscode.Position,
    requestPolicy: ReturnType<typeof getInlineRequestPolicy>,
    triggerKind: vscode.InlineCompletionTriggerKind
  ): Promise<CompletionRequest> {
    const prefixLineBudget = Math.min(
      this.maxPrefixLines,
      requestPolicy.maxPrefixLines ?? this.maxPrefixLines
    );
    const suffixLineBudget = Math.min(
      this.maxSuffixLines,
      requestPolicy.maxSuffixLines ?? this.maxSuffixLines
    );
    const prefixStartLine = Math.max(0, position.line - prefixLineBudget);
    const prefixRange = new vscode.Range(prefixStartLine, 0, position.line, position.character);
    const prefix = document.getText(prefixRange);

    const suffixEndLine = Math.min(document.lineCount - 1, position.line + suffixLineBudget);
    const suffixRange = new vscode.Range(
      position.line, position.character,
      suffixEndLine, document.lineAt(suffixEndLine).text.length
    );
    const suffix = document.getText(suffixRange);

    let additionalContext = '';

    if (requestPolicy.includeAdditionalContext) {
      // 1. Fetch beginning of the current file if prefix doesn't cover it (useful for imports, class variables)
      if (prefixStartLine > 0) {
        const topLines = Math.min(prefixStartLine, 50); // Get up to 50 lines of the top of the file
        additionalContext += `// Top of current file:\n${document.getText(new vscode.Range(0, 0, topLines, 0))}\n\n`;
      }

      // 2. Fetch snippets from other open text documents (same language) to establish cross-file context
      const openDocs = vscode.workspace.textDocuments.filter(
        (doc) => doc.uri.toString() !== document.uri.toString() && doc.languageId === document.languageId
      );

      // Get up to 3 recently active related files, taking the first 1500 chars of each
      for (const doc of openDocs.slice(0, 3)) {
         const text = doc.getText();
         const snippet = text.length > 1500 ? text.substring(0, 1500) + '\n... (truncated)' : text;
         const filename = doc.fileName.split(/[/\\]/).pop();
         additionalContext += `// Open file: ${filename}\n${snippet}\n\n`;
      }

      // 3. Heuristic: Semantic Class Reference Fetching
      // Extract recent PascalCase words that look like class/struct names from the prefix
      // Attempt to find files matching these words in the workspace (up to 4 words)
      const ext = document.fileName.substring(document.fileName.lastIndexOf('.'));
      const searchWords = extractReferencedWords(prefix).reverse().slice(0, 4);
      
      if (searchWords.length > 0) {
        const searchPromises = searchWords.map(async (word) => {
          try {
            // 1. Try LSP Workspace Symbol Provider (resolves interfaces, structs, classes accurately)
            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
              'vscode.executeWorkspaceSymbolProvider',
              word
            );

            if (symbols && symbols.length > 0) {
              // Find an exact match for Class, Interface, or Struct
              const targetSymbol = symbols.find(s => 
                s.name === word && 
                (s.kind === vscode.SymbolKind.Class || s.kind === vscode.SymbolKind.Interface || s.kind === vscode.SymbolKind.Struct)
              );

              if (targetSymbol && targetSymbol.location.uri.toString() !== document.uri.toString()) {
                const fileData = await vscode.workspace.fs.readFile(targetSymbol.location.uri);
                const text = Buffer.from(fileData).toString('utf8');
                const startLine = Math.max(0, targetSymbol.location.range.start.line - 2);
                const snippet = sliceLines(text, startLine, 50);
                const filename = targetSymbol.location.uri.path.split(/[/\\]/).pop();
                return `// Referenced Symbol: ${word} (from ${filename})\n${snippet}\n\n`;
              }
            }

            // 2. Fallback: Find exact file name (e.g. "ShopModel.cs")
            const uris = await vscode.workspace.findFiles(`**/${word}${ext}`, '**/node_modules/**', 1);
            if (uris.length > 0 && uris[0].toString() !== document.uri.toString()) {
              const fileData = await vscode.workspace.fs.readFile(uris[0]);
              const text = Buffer.from(fileData).toString('utf8');
              const snippet = sliceLines(text, 0, 50);
              return `// Referenced Class File: ${word}${ext}\n${snippet}\n\n`;
            }
          } catch (_error) {
            // Ignore read errors
          }
          return '';
        });

        // Wait for file searches, but bound the time to avoid slowing down inline completion
        const results = await Promise.race([
          Promise.all(searchPromises),
          new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 200)) // 200ms timeout
        ]);
        
        additionalContext += results.filter(Boolean).join('');
      }
    }

    // Single-line vs Multi-line logic
    const currentLine = document.lineAt(position.line).text;
    const stopSequences = getInlineStopSequences(currentLine, position.character);

    return {
      mode:
        triggerKind === vscode.InlineCompletionTriggerKind.Automatic
          ? 'automatic'
          : 'explicit',
      prefix,
      suffix,
      language: document.languageId,
      filename: document.fileName.split(/[/\\]/).pop() || 'unknown',
      additionalContext: additionalContext.trim(),
      stopSequences,
      maxTokens: requestPolicy.maxTokens,
    };
  }

  private shouldSkipAutomaticRequestForCopilot(
    languageId: string,
    triggerKind: vscode.InlineCompletionTriggerKind
  ): boolean {
    const copilotExtension = vscode.extensions.getExtension(COPILOT_EXTENSION_ID);
    const editorConfig = vscode.workspace.getConfiguration('editor');
    const copilotConfig = vscode.workspace.getConfiguration('github.copilot');

    return shouldSkipNoPilotAutomaticInline({
      isAutomaticTrigger: triggerKind === vscode.InlineCompletionTriggerKind.Automatic,
      pauseWhenCopilotActive: this.pauseWhenCopilotActive,
      editorInlineSuggestEnabled: editorConfig.get('inlineSuggest.enabled', true),
      copilotExtensionInstalled: Boolean(copilotExtension),
      copilotExtensionActive: Boolean(copilotExtension?.isActive),
      copilotLanguageEnabled: isCopilotEnabledForLanguage(
        copilotConfig.get('enable'),
        languageId
      ),
    });
  }

  private cleanResponseText(
    text: string,
    prefix: string,
    suffix: string,
    stopSequences?: string[]
  ): string {
    let cleaned = stripMarkdownCodeFences(text.trimEnd());

    // 1. Remove common overlap with the exact characters before the cursor
    // e.g., prefix ends with "ShopModel", AI outputs "ShopModel data ="
    for (let i = Math.min(60, prefix.length); i > 0; i--) {
      const slice = prefix.slice(-i);
      if (cleaned.startsWith(slice)) {
        cleaned = cleaned.substring(slice.length);
        break;
      }
    }

    // 2. Remove common overlap with the exact characters after the cursor
    for (let i = Math.min(60, suffix.length, cleaned.length); i > 0; i--) {
      const slice = suffix.slice(0, i);
      if (cleaned.endsWith(slice)) {
        cleaned = cleaned.substring(0, cleaned.length - slice.length);
        break;
      }
    }

    // 3. Truncate if the AI starts generating lines that already exist in the suffix
    // This happens frequently when AI fails to stop generating.
    const suffixLines = suffix.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    if (suffixLines.length > 0) {
      const cleanedLines = cleaned.split('\n');
      let truncateIdx = -1;
      for (let i = 0; i < cleanedLines.length; i++) {
        const lineTrim = cleanedLines[i].trim();
        // If a line from the AI output exactly matches a significant line in the suffix
        if (lineTrim.length > 5 && suffixLines.includes(lineTrim)) {
           truncateIdx = i;
           break;
        }
      }
      if (truncateIdx !== -1) {
         cleaned = cleanedLines.slice(0, truncateIdx).join('\n');
      }
    }

    if (stopSequences?.includes('\n')) {
      cleaned = trimSingleLineCompletion(cleaned);
    }

    return cleaned;
  }

  /**
   * Debounce using VS Code's cancellation token.
   * Returns true if cancelled during wait.
   */
  private debounce(token: vscode.CancellationToken): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = undefined;
      }

      if (token.isCancellationRequested) {
        resolve(true);
        return;
      }

      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = undefined;
        resolve(false);
      }, this.debounceMs);

      token.onCancellationRequested(() => {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = undefined;
        }
        resolve(true);
      });
    });
  }

  toggle(): void {
    this.enabled = !this.enabled;
    vscode.workspace
      .getConfiguration('nopilot')
      .update('inline.enabled', this.enabled, vscode.ConfigurationTarget.Global);
    log(`Inline suggestions ${this.enabled ? 'enabled' : 'disabled'}`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isPausedForCopilot(languageId = vscode.window.activeTextEditor?.document.languageId): boolean {
    if (!this.enabled || !languageId) {
      return false;
    }

    return this.shouldSkipAutomaticRequestForCopilot(
      languageId,
      vscode.InlineCompletionTriggerKind.Automatic
    );
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.disposables.forEach((d) => d.dispose());
  }
}
