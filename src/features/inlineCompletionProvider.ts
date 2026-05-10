import * as vscode from 'vscode';
import { ProviderManager } from '../providers/providerManager';
import type {
  CompletionRequest,
  InlineOptimizationProfile,
  InlineQualityProfile,
  InlineRequestStatus,
  OllamaRemoteMode,
  ProviderInfo,
} from '../types';
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
import {
  createIdleInlineRequestStatus,
  getInlineRequestStatusMessage,
} from './inlineRequestStatus';
import {
  createOllamaRemoteModeTracker,
  normalizeOllamaRemoteMode,
  resolveOllamaRemoteMode,
} from '../providers/ollamaRemoteMode';

const WORKSPACE_SIMILAR_FILE_EXCLUDE_GLOB =
  '**/{node_modules,dist,out,build,coverage,.git}/**';
const MAX_OPEN_SIMILAR_FILE_CANDIDATES = 4;
const MAX_WORKSPACE_SIMILAR_FILE_CANDIDATES = 4;
const MAX_WORKSPACE_MATCHES_PER_KEYWORD = 2;
const SIMILAR_FILE_SEARCH_TIMEOUT_MS = 150;

function normalizeDebounceMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 500;
  }

  return Math.min(2000, Math.max(100, Math.trunc(value)));
}

function normalizeContextLineCount(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
}

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
  private readonly requestStatusEmitter = new vscode.EventEmitter<InlineRequestStatus>();
  readonly onDidChangeRequestStatus = this.requestStatusEmitter.event;
  private requestStatus: InlineRequestStatus = createIdleInlineRequestStatus();
  private readonly ollamaRemoteTracker = createOllamaRemoteModeTracker();
  private activeRequestStatusId: number | undefined;
  private requestStatusClearTimer: ReturnType<typeof setTimeout> | undefined;
  private requestSlowTimer: ReturnType<typeof setTimeout> | undefined;
  private hintedEditor: vscode.TextEditor | undefined;
  private inlineHintDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 1.2em',
      color: new vscode.ThemeColor('descriptionForeground'),
      fontStyle: 'italic',
    },
  });

  constructor(private readonly providerManager: ProviderManager) {
    const config = vscode.workspace.getConfiguration('nopilot');
    this.enabled = config.get('inline.enabled', true);
    this.qualityProfile = config.get<InlineQualityProfile>('inline.qualityProfile', 'balanced');
    this.pauseWhenCopilotActive = config.get('inline.pauseWhenCopilotActive', true);
    this.debounceMs = normalizeDebounceMs(config.get('inline.debounceMs', 500));
    this.maxPrefixLines = normalizeContextLineCount(
      config.get('inline.maxPrefixLines', 50),
      50
    );
    this.maxSuffixLines = normalizeContextLineCount(
      config.get('inline.maxSuffixLines', 20),
      20
    );

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('nopilot.inline')) {
          const cfg = vscode.workspace.getConfiguration('nopilot');
          this.enabled = cfg.get('inline.enabled', true);
          this.qualityProfile = cfg.get<InlineQualityProfile>('inline.qualityProfile', 'balanced');
          this.pauseWhenCopilotActive = cfg.get('inline.pauseWhenCopilotActive', true);
          this.debounceMs = normalizeDebounceMs(cfg.get('inline.debounceMs', 500));
          this.maxPrefixLines = normalizeContextLineCount(
            cfg.get('inline.maxPrefixLines', 50),
            50
          );
          this.maxSuffixLines = normalizeContextLineCount(
            cfg.get('inline.maxSuffixLines', 20),
            20
          );
        }
      }),
      this.providerManager.onDidChangeProvider(() => {
        this.invalidateActiveRemoteRequestLifecycle();
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
      this.invalidateActiveRemoteRequestLifecycle();
      return undefined;
    }

    if (this.shouldSkipAutomaticRequestForCopilot(document.languageId, context.triggerKind)) {
      this.invalidateActiveRemoteRequestLifecycle();
      return undefined;
    }

    const isRemoteOllama = this.resolveActiveOllamaRemoteMode();
    const inlineOptimizationProfile = isRemoteOllama ? 'remote-ollama' : 'standard';
    const isAutomaticTrigger =
      context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic;
    const shouldTrackRemoteAutomatic = isRemoteOllama && isAutomaticTrigger;
    let requestId: number | undefined;
    if (!shouldTrackRemoteAutomatic) {
      requestId = this.invalidateActiveRemoteRequestLifecycle();
    }

    const currentLine = document.lineAt(position.line).text;
    const requestPolicy = getInlineRequestPolicy({
      isAutomaticTrigger,
      qualityProfile: this.qualityProfile,
      inlineOptimizationProfile,
      lineText: currentLine,
      cursorCharacter: position.character,
    });
    const activeProvider = this.providerManager.getActiveProvider();
    const cacheScope = buildInlineCacheScope(
      this.providerManager.getActiveProviderId(),
      activeProvider.info.currentModel,
      this.qualityProfile,
      inlineOptimizationProfile
    );

    if (requestPolicy.skip) {
      if (shouldTrackRemoteAutomatic) {
        this.invalidateActiveRemoteRequestLifecycle();
      }
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
      if (shouldTrackRemoteAutomatic) {
        this.invalidateActiveRemoteRequestLifecycle();
      }
      const cachedText = this.cache.get(cacheKey)!;
      log(`Inline Cache Hit: ✅ ${cachedText.length} chars (instant)`);
      return [new vscode.InlineCompletionItem(cachedText, new vscode.Range(position, position))];
    }

    // Assign a unique ID to this request
    requestId ??= ++this.requestCounter;

    // Debounce — wait for user to stop typing
    const wasCancelled = await this.debounce(token);
    if (wasCancelled || token.isCancellationRequested) {
      if (shouldTrackRemoteAutomatic) {
        this.clearRemoteRequestLifecycle(activeProvider.info, requestId, 'cancelled');
      }
      return undefined;
    }

    // If a newer request came in during debounce, abandon this one
    if (requestId !== this.requestCounter) {
      if (shouldTrackRemoteAutomatic) {
        this.clearRemoteRequestLifecycle(activeProvider.info, requestId, 'cancelled');
      }
      return undefined;
    }

    const buildStart = Date.now();
    const request = await this.buildRequest(
      document,
      position,
      requestPolicy,
      context.triggerKind,
      cacheScope,
      inlineOptimizationProfile
    );

    if (requestId !== this.requestCounter) {
      if (shouldTrackRemoteAutomatic) {
        this.clearRemoteRequestLifecycle(activeProvider.info, requestId, 'cancelled');
      }
      return undefined;
    }

    const buildDurationMs = Date.now() - buildStart;
    log(
      `Inline request #${requestId}: ${request.filename} (${request.language}), line ${position.line + 1}, prefix ${request.prefix.length} chars, build ${buildDurationMs}ms`
    );

    try {
      const shouldTrackRequestStatus =
        shouldTrackRemoteAutomatic && request.mode === 'automatic';
      if (shouldTrackRequestStatus) {
        this.beginRemoteRequestLifecycle(requestId, activeProvider.info);
      }

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
        if (shouldTrackRequestStatus) {
          this.clearRemoteRequestLifecycle(activeProvider.info, requestId, 'cancelled');
        }
        return undefined;
      }

      if (token.isCancellationRequested) {
        log(`Inline #${requestId}: cancelled by VS Code`);
        if (shouldTrackRequestStatus) {
          this.clearRemoteRequestLifecycle(activeProvider.info, requestId, 'cancelled');
        }
        return undefined;
      }

      if (!response.text) {
        log(`Inline #${requestId}: empty response`);
        if (shouldTrackRequestStatus) {
          this.clearRemoteRequestLifecycle(activeProvider.info, requestId);
        }
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
        if (shouldTrackRequestStatus) {
          this.clearRemoteRequestLifecycle(activeProvider.info, requestId);
        }
        return undefined;
      }

      if (shouldTrackRequestStatus) {
        this.ollamaRemoteTracker.recordSuccess(providerDurationMs);
        this.clearSlowTimer();
        this.scheduleRequestStatusClear(requestId);
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
        if (shouldTrackRemoteAutomatic) {
          this.clearRemoteRequestLifecycle(activeProvider.info, requestId, 'cancelled');
        }
        return undefined;
      }
      if (shouldTrackRemoteAutomatic) {
        this.ollamaRemoteTracker.recordFailure();
        this.clearRemoteRequestLifecycle(activeProvider.info, requestId, 'connection-problem');
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
    cacheScope: string,
    inlineOptimizationProfile: InlineOptimizationProfile
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
      inlineOptimizationProfile,
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

    const includeWorkspaceContext = requestPolicy.additionalContextScope === 'workspace';
    const contextKey = buildDerivedContextCacheKey({
      scope: cacheScope,
      documentUri: document.uri.toString(),
      documentVersion: document.version,
      language: document.languageId,
      contextFlavor: requestPolicy.additionalContextScope,
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

        if (includeWorkspaceContext) {
          const similarFileSample = await this.resolveSimilarFileSampleContext(
            document,
            searchWords
          );
          if (similarFileSample.value) {
            additionalSections.push(similarFileSample.value);
            similarFileSample.dependencyUris.forEach((uri) => dependencyUris.add(uri));
          }
        }

        if (includeWorkspaceContext && searchWords.length > 0) {
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

  getRequestStatus(): InlineRequestStatus {
    return this.requestStatus;
  }

  private getOllamaRemoteModeSetting(): OllamaRemoteMode {
    return normalizeOllamaRemoteMode(
      vscode.workspace.getConfiguration('nopilot.ollama').get('remoteMode', 'auto')
    );
  }

  private getOllamaEndpoint(): string {
    return vscode.workspace
      .getConfiguration('nopilot.ollama')
      .get('endpoint', 'http://localhost:11434');
  }

  private resolveActiveOllamaRemoteMode(): boolean {
    if (this.providerManager.getActiveProviderId() !== 'ollama') {
      return false;
    }

    const snapshot = this.ollamaRemoteTracker.snapshot();
    return resolveOllamaRemoteMode({
      setting: this.getOllamaRemoteModeSetting(),
      endpoint: this.getOllamaEndpoint(),
      recentDurationsMs: snapshot.recentDurationsMs,
      recentFailureCount: snapshot.recentFailureCount,
    }).enabled;
  }

  private setRequestStatus(status: InlineRequestStatus): void {
    if (status.kind !== 'idle') {
      this.clearRequestStatusClearTimer();
    }
    this.requestStatus = status;
    this.requestStatusEmitter.fire(status);
    this.updateEditorHint(status);
  }

  private invalidateActiveRemoteRequestLifecycle(requestId = ++this.requestCounter): number {
    if (requestId > this.requestCounter) {
      this.requestCounter = requestId;
    }

    this.clearSlowTimer();
    this.clearRequestStatusClearTimer();
    this.activeRequestStatusId = undefined;
    this.setRequestStatus(createIdleInlineRequestStatus());
    return requestId;
  }

  private beginRemoteRequestLifecycle(requestId: number, providerInfo: ProviderInfo): void {
    if (requestId !== this.requestCounter) {
      return;
    }

    this.activeRequestStatusId = requestId;
    this.setRequestStatus({
      kind: 'waiting',
      providerId: providerInfo.id,
      providerName: providerInfo.name,
      model: providerInfo.currentModel,
      message: 'Requesting from remote Ollama...',
    });
    this.scheduleSlowStatus(requestId);
  }

  private ownsRemoteRequestLifecycle(requestId: number): boolean {
    return this.activeRequestStatusId === requestId;
  }

  private scheduleRequestStatusClear(requestId: number, delayMs = 900): void {
    if (!this.ownsRemoteRequestLifecycle(requestId)) {
      return;
    }

    this.clearRequestStatusClearTimer();

    this.requestStatusClearTimer = setTimeout(() => {
      if (!this.ownsRemoteRequestLifecycle(requestId)) {
        return;
      }

      this.requestStatusClearTimer = undefined;
      this.activeRequestStatusId = undefined;
      this.setRequestStatus(createIdleInlineRequestStatus());
    }, delayMs);
  }

  private clearRequestStatusClearTimer(): void {
    if (this.requestStatusClearTimer) {
      clearTimeout(this.requestStatusClearTimer);
      this.requestStatusClearTimer = undefined;
    }
  }

  private clearSlowTimer(): void {
    if (this.requestSlowTimer) {
      clearTimeout(this.requestSlowTimer);
      this.requestSlowTimer = undefined;
    }
  }

  private scheduleSlowStatus(requestId: number): void {
    this.clearSlowTimer();
    this.requestSlowTimer = setTimeout(() => {
      this.requestSlowTimer = undefined;
      if (this.ownsRemoteRequestLifecycle(requestId) && this.requestStatus.kind === 'waiting') {
        this.setRequestStatus({
          ...this.requestStatus,
          kind: 'slow',
          message: 'Slow response from model',
        });
      }
    }, 1200);
  }

  private clearRemoteRequestLifecycle(
    providerInfo: ProviderInfo,
    requestId: number,
    statusKind?: 'cancelled' | 'connection-problem',
    force = false
  ): void {
    if (!force && !this.ownsRemoteRequestLifecycle(requestId)) {
      return;
    }

    this.clearSlowTimer();

    if (!statusKind) {
      this.clearRequestStatusClearTimer();
      this.activeRequestStatusId = undefined;
      this.setRequestStatus(createIdleInlineRequestStatus());
      return;
    }

    this.setRequestStatus({
      kind: statusKind,
      providerId: providerInfo.id,
      providerName: providerInfo.name,
      model: providerInfo.currentModel,
    });
    this.scheduleRequestStatusClear(requestId);
  }

  private updateEditorHint(status: InlineRequestStatus): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || status.kind === 'idle') {
      this.clearEditorHint(editor);
      return;
    }

    const message = getInlineRequestStatusMessage(status);
    if (!message) {
      this.clearEditorHint(editor);
      return;
    }

    if (this.hintedEditor && this.hintedEditor !== editor) {
      this.hintedEditor.setDecorations(this.inlineHintDecorationType, []);
    }

    const position = editor.selection.active;
    const range = new vscode.Range(position, position);
    editor.setDecorations(this.inlineHintDecorationType, [{
      range,
      renderOptions: {
        after: {
          contentText: ` ${message}`,
        },
      },
    }]);
    this.hintedEditor = editor;
  }

  private clearEditorHint(activeEditor = vscode.window.activeTextEditor): void {
    if (this.hintedEditor) {
      this.hintedEditor.setDecorations(this.inlineHintDecorationType, []);
    }

    if (activeEditor && activeEditor !== this.hintedEditor) {
      activeEditor.setDecorations(this.inlineHintDecorationType, []);
    }

    this.hintedEditor = undefined;
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
    this.clearSlowTimer();
    this.clearRequestStatusClearTimer();
    this.clearEditorHint();
    this.inlineHintDecorationType.dispose();
    this.requestStatusEmitter.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
