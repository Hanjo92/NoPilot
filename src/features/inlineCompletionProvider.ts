import * as vscode from 'vscode';
import { ProviderManager } from '../providers/providerManager';
import { CompletionRequest, InlineQualityProfile } from '../types';
import { log, logError } from '../utils/logger';
import {
  cleanInlineCompletionText,
  buildInlineCacheScope,
  extractReferencedWords,
  getInlineRequestPolicy,
  getInlineStopSequences,
  sliceLines,
} from './inlineText';
import { extractCurrentBlockContext } from './inlineBlockContext';
import {
  buildDerivedContextCacheKey,
  buildSymbolSnippetCacheKey,
  InlineRequestAssemblyCache,
} from './inlineContextCache';
import {
  buildCurrentFileStructureContext,
  extractContextKeywords,
  selectSimilarFileSampleContext,
  type SimilarFileCandidate,
} from './inlineProjectContext';
import {
  COPILOT_EXTENSION_ID,
  isCopilotEnabledForLanguage,
  shouldSkipNoPilotAutomaticInline,
} from './copilotDetection';

const WORKSPACE_SIMILAR_FILE_EXCLUDE_GLOB =
  '**/{node_modules,dist,out,build,coverage,.git}/**';
const MAX_OPEN_SIMILAR_FILE_CANDIDATES = 4;
const MAX_WORKSPACE_SIMILAR_FILE_CANDIDATES = 4;
const MAX_WORKSPACE_MATCHES_PER_KEYWORD = 2;
const SIMILAR_FILE_SEARCH_TIMEOUT_MS = 150;

/**
 * Inline completion provider that uses the active AI provider
 * to suggest code as the user types (ghost text / gray suggestions).
 */
export class NoPilotInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private requestCounter = 0; // Track which request is "current"
  private enabled: boolean;
  private pauseWhenCopilotActive: boolean;
  private qualityProfile: InlineQualityProfile;
  private debounceMs: number;
  private maxPrefixLines: number;
  private maxSuffixLines: number;
  private disposables: vscode.Disposable[] = [];

  // LRU Cache for instant responses
  private cache = new Map<string, string>();
  private cacheKeys: string[] = [];
  private readonly MAX_CACHE_SIZE = 50;
  private readonly requestAssemblyCache = new InlineRequestAssemblyCache();

  constructor(private readonly providerManager: ProviderManager) {
    const config = vscode.workspace.getConfiguration('nopilot');
    this.enabled = config.get('inline.enabled', true);
    this.qualityProfile = config.get<InlineQualityProfile>('inline.qualityProfile', 'balanced');
    this.pauseWhenCopilotActive = config.get('inline.pauseWhenCopilotActive', true);
    this.debounceMs = config.get('inline.debounceMs', 300);
    this.maxPrefixLines = config.get('inline.maxPrefixLines', 50);
    this.maxSuffixLines = config.get('inline.maxSuffixLines', 20);

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('nopilot.inline')) {
          const cfg = vscode.workspace.getConfiguration('nopilot');
          this.enabled = cfg.get('inline.enabled', true);
          this.qualityProfile = cfg.get<InlineQualityProfile>('inline.qualityProfile', 'balanced');
          this.pauseWhenCopilotActive = cfg.get('inline.pauseWhenCopilotActive', true);
          this.debounceMs = cfg.get('inline.debounceMs', 300);
          this.maxPrefixLines = cfg.get('inline.maxPrefixLines', 50);
          this.maxSuffixLines = cfg.get('inline.maxSuffixLines', 20);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.requestAssemblyCache.invalidateDocument(event.document.uri.toString());
        this.requestAssemblyCache.clearSymbolLookups();
      }),
      vscode.workspace.onDidOpenTextDocument(() => {
        this.requestAssemblyCache.clearDerivedContexts();
        this.requestAssemblyCache.clearSymbolLookups();
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.requestAssemblyCache.invalidateDocument(document.uri.toString());
        this.requestAssemblyCache.clearDerivedContexts();
        this.requestAssemblyCache.clearSymbolLookups();
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
      qualityProfile: this.qualityProfile,
      lineText: currentLine,
      cursorCharacter: position.character,
    });
    const activeProvider = this.providerManager.getActiveProvider();
    const cacheScope = buildInlineCacheScope(
      this.providerManager.getActiveProviderId(),
      activeProvider.info.currentModel,
      this.qualityProfile
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
    const request = await this.buildRequest(
      document,
      position,
      requestPolicy,
      context.triggerKind,
      cacheScope
    );
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

      const cleanedText = cleanInlineCompletionText({
        text: response.text,
        prefix: request.prefix,
        suffix: request.suffix,
        stopSequences: request.stopSequences,
      });

      if (!cleanedText) {
        log(`Inline #${requestId}: empty after cleanup`);
        return undefined;
      }

      log(
        `Inline #${requestId}: ✅ ${cleanedText.length} chars | provider ${providerDurationMs}ms | mode ${request.mode || 'explicit'} | profile ${this.qualityProfile}`
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
    triggerKind: vscode.InlineCompletionTriggerKind,
    cacheScope: string
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
    const searchWords = extractReferencedWords(prefix).reverse().slice(0, 4);
    const additionalContext = await this.buildAdditionalContext(
      document,
      prefix,
      prefixStartLine,
      requestPolicy,
      cacheScope,
      searchWords
    );
    const currentBlockContext =
      triggerKind === vscode.InlineCompletionTriggerKind.Automatic
        ? extractCurrentBlockContext(document.getText(), document.offsetAt(position))
        : undefined;

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
      currentBlockContext,
      stopSequences,
      maxTokens: requestPolicy.maxTokens,
    };
  }

  private async buildAdditionalContext(
    document: vscode.TextDocument,
    prefix: string,
    prefixStartLine: number,
    requestPolicy: ReturnType<typeof getInlineRequestPolicy>,
    cacheScope: string,
    searchWords: string[]
  ): Promise<string> {
    if (!requestPolicy.includeAdditionalContext) {
      return '';
    }

    const contextKey = buildDerivedContextCacheKey({
      scope: cacheScope,
      documentUri: document.uri.toString(),
      documentVersion: document.version,
      language: document.languageId,
      contextFlavor: requestPolicy.includeAdditionalContext ? 'full' : 'light',
      prefixStartLine,
      referencedWords: searchWords,
    });
    const cachedContext = await this.requestAssemblyCache.getDerivedContext(
      contextKey,
      async () => {
        const additionalSections: string[] = [];
        const dependencyUris = new Set<string>([document.uri.toString()]);
        const structureContext = buildCurrentFileStructureContext({
          filename: this.getBasename(document.fileName),
          text: document.getText(),
        });

        if (structureContext) {
          additionalSections.push(structureContext);
        }

        if (requestPolicy.includeAdditionalContext) {
          const similarFileSample = await this.resolveSimilarFileSampleContext(
            document,
            searchWords
          );
          if (similarFileSample.value) {
            additionalSections.push(similarFileSample.value);
            similarFileSample.dependencyUris.forEach((uri) => dependencyUris.add(uri));
          }
        }

        if (requestPolicy.includeAdditionalContext && searchWords.length > 0) {
          const extension = this.getFileExtension(document.fileName);
          const searchPromises = searchWords.map((word) =>
            this.resolveReferencedSymbolSnippet(document, extension, word)
          );
          const results = await Promise.race([
            Promise.all(searchPromises),
            new Promise<Array<{ value: string; dependencyUris: string[] }>>((resolve) =>
              setTimeout(() => resolve([]), 200)
            ),
          ]);

          for (const result of results) {
            if (!result.value) {
              continue;
            }

            additionalSections.push(result.value.trim());
            result.dependencyUris.forEach((uri) => dependencyUris.add(uri));
          }
        }

        return {
          value: additionalSections.join('\n\n').trim(),
          dependencyUris: Array.from(dependencyUris),
        };
      }
    );

    log(
      `Inline context cache ${cachedContext.hit ? 'hit' : 'miss'}: ${document.uri.toString()}@${document.version}`
    );

    return cachedContext.value;
  }

  private async resolveSimilarFileSampleContext(
    document: vscode.TextDocument,
    searchWords: string[]
  ): Promise<{ value: string; dependencyUris: string[] }> {
    const candidates = await this.collectSimilarFileCandidates(document, searchWords);
    if (candidates.length === 0) {
      return {
        value: '',
        dependencyUris: [],
      };
    }

    const selection = selectSimilarFileSampleContext({
      currentUri: document.uri.toString(),
      currentFilename: this.getBasename(document.fileName),
      language: document.languageId,
      referencedWords: searchWords,
      candidates,
    });

    if (selection.selectedUri) {
      log(`Inline similar sample: ${selection.selectedUri}`);
    }

    return {
      value: selection.value,
      dependencyUris: selection.selectedUri ? [selection.selectedUri] : [],
    };
  }

  private async collectSimilarFileCandidates(
    document: vscode.TextDocument,
    searchWords: string[]
  ): Promise<SimilarFileCandidate[]> {
    const currentUri = document.uri.toString();
    const candidates = new Map<string, SimilarFileCandidate>();
    const maxCandidates =
      MAX_OPEN_SIMILAR_FILE_CANDIDATES + MAX_WORKSPACE_SIMILAR_FILE_CANDIDATES;

    const addCandidate = (candidate: SimilarFileCandidate): void => {
      if (
        candidate.uri === currentUri ||
        candidate.language !== document.languageId ||
        candidate.text.trim().length === 0 ||
        candidates.has(candidate.uri) ||
        this.isGeneratedLikeFile(candidate.filename)
      ) {
        return;
      }

      candidates.set(candidate.uri, candidate);
    };

    const openDocs = vscode.workspace.textDocuments.filter(
      (doc) =>
        doc.uri.toString() !== currentUri && doc.languageId === document.languageId
    );

    for (const doc of openDocs.slice(0, MAX_OPEN_SIMILAR_FILE_CANDIDATES)) {
      addCandidate({
        uri: doc.uri.toString(),
        filename: this.getBasename(doc.fileName),
        language: doc.languageId,
        text: doc.getText(),
        isOpen: true,
      });
    }

    const workspaceUris = await Promise.race([
      this.findWorkspaceSimilarFileUris(document, searchWords),
      new Promise<vscode.Uri[]>((resolve) =>
        setTimeout(() => resolve([]), SIMILAR_FILE_SEARCH_TIMEOUT_MS)
      ),
    ]);

    for (const uri of workspaceUris) {
      if (candidates.size >= maxCandidates || uri.toString() === currentUri) {
        break;
      }

      const text = await this.readWorkspaceFileText(uri);
      if (!text) {
        continue;
      }

      addCandidate({
        uri: uri.toString(),
        filename: this.getBasename(uri.fsPath),
        language: document.languageId,
        text,
        isOpen: false,
      });
    }

    return Array.from(candidates.values()).slice(0, maxCandidates);
  }

  private async findWorkspaceSimilarFileUris(
    document: vscode.TextDocument,
    searchWords: string[]
  ): Promise<vscode.Uri[]> {
    const extension = this.getFileExtension(document.fileName);
    if (!extension) {
      return [];
    }

    const keywords = extractContextKeywords(this.getBasename(document.fileName), searchWords)
      .slice(0, 3);
    if (keywords.length === 0) {
      return [];
    }

    const uriGroups = await Promise.all(
      keywords.map((keyword) =>
        vscode.workspace.findFiles(
          `**/*${keyword}*${extension}`,
          WORKSPACE_SIMILAR_FILE_EXCLUDE_GLOB,
          MAX_WORKSPACE_MATCHES_PER_KEYWORD
        )
      )
    );
    const seen = new Set<string>();
    const uris: vscode.Uri[] = [];

    for (const group of uriGroups) {
      for (const uri of group) {
        const uriKey = uri.toString();
        const filename = this.getBasename(uri.fsPath);
        if (
          seen.has(uriKey) ||
          uriKey === document.uri.toString() ||
          this.isGeneratedLikeFile(filename)
        ) {
          continue;
        }

        seen.add(uriKey);
        uris.push(uri);
        if (uris.length >= MAX_WORKSPACE_SIMILAR_FILE_CANDIDATES) {
          return uris;
        }
      }
    }

    return uris;
  }

  private async readWorkspaceFileText(uri: vscode.Uri): Promise<string | undefined> {
    try {
      const fileData = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(fileData).toString('utf8');
    } catch (_error) {
      return undefined;
    }
  }

  private isGeneratedLikeFile(filename: string): boolean {
    return (
      /\.d\.ts$/i.test(filename) ||
      /\.(?:g|gen|generated)\.[^.]+$/i.test(filename) ||
      /\.min\.[^.]+$/i.test(filename)
    );
  }

  private async resolveReferencedSymbolSnippet(
    document: vscode.TextDocument,
    extension: string,
    word: string
  ): Promise<{ value: string; dependencyUris: string[] }> {
    const cacheKey = buildSymbolSnippetCacheKey({
      word,
      extension,
      excludeUri: document.uri.toString(),
    });
    const cachedSnippet = await this.requestAssemblyCache.getSymbolSnippet(
      cacheKey,
      async () => {
        try {
          const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            word
          );

          if (symbols && symbols.length > 0) {
            const targetSymbol = symbols.find(
              (symbol) =>
                symbol.name === word &&
                (symbol.kind === vscode.SymbolKind.Class ||
                  symbol.kind === vscode.SymbolKind.Interface ||
                  symbol.kind === vscode.SymbolKind.Struct)
            );

            if (
              targetSymbol &&
              targetSymbol.location.uri.toString() !== document.uri.toString()
            ) {
              const fileData = await vscode.workspace.fs.readFile(targetSymbol.location.uri);
              const text = Buffer.from(fileData).toString('utf8');
              const startLine = Math.max(0, targetSymbol.location.range.start.line - 2);
              const snippet = sliceLines(text, startLine, 50);
              const filename = targetSymbol.location.uri.path.split(/[/\\]/).pop();

              return {
                value: `// Referenced Symbol: ${word} (from ${filename})\n${snippet}\n\n`,
                dependencyUris: [targetSymbol.location.uri.toString()],
              };
            }
          }

          if (!extension) {
            return {
              value: '',
              dependencyUris: [],
            };
          }

          const uris = await vscode.workspace.findFiles(
            `**/${word}${extension}`,
            '**/node_modules/**',
            1
          );
          if (uris.length > 0 && uris[0].toString() !== document.uri.toString()) {
            const fileData = await vscode.workspace.fs.readFile(uris[0]);
            const text = Buffer.from(fileData).toString('utf8');
            const snippet = sliceLines(text, 0, 50);

            return {
              value: `// Referenced Class File: ${word}${extension}\n${snippet}\n\n`,
              dependencyUris: [uris[0].toString()],
            };
          }
        } catch (_error) {
          // Ignore lookup/read errors
        }

        return {
          value: '',
          dependencyUris: [],
        };
      }
    );

    log(`Inline symbol cache ${cachedSnippet.hit ? 'hit' : 'miss'}: ${word}`);

    return {
      value: cachedSnippet.value,
      dependencyUris: cachedSnippet.dependencyUris,
    };
  }

  private getFileExtension(filename: string): string {
    const dotIndex = filename.lastIndexOf('.');
    return dotIndex >= 0 ? filename.substring(dotIndex) : '';
  }

  private getBasename(filename: string): string {
    return filename.split(/[/\\]/).pop() || 'unknown';
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
