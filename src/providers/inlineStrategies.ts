import type { CompletionRequest, ProviderId } from '../types';
import { buildCompletionPrompt } from './prompts';

export type InlineStrategyId = 'chat' | 'vscode-lm' | 'ollama' | 'shared-chat';

export interface ResolvedInlineCompletionConfig {
  strategyId: InlineStrategyId;
  prompt: string;
  maxTokens: number;
  stopSequences?: string[];
}

const DEFAULT_INLINE_MAX_TOKENS = 256;
const VSCODE_LM_AUTOMATIC_MAX_TOKENS = 128;
const OLLAMA_AUTOMATIC_MAX_TOKENS = 160;
const REMOTE_OLLAMA_AUTOMATIC_MAX_TOKENS = 96;

export function getInlineStrategyId(
  providerId: ProviderId
): Exclude<InlineStrategyId, 'shared-chat'> {
  switch (providerId) {
    case 'vscode-lm':
      return 'vscode-lm';
    case 'ollama':
      return 'ollama';
    default:
      return 'chat';
  }
}

function isInlineChatRequest(request: CompletionRequest): boolean {
  return request.mode === 'chat' || Boolean(request.instruction);
}

function buildVscodeLmStopDirective(): string {
  return 'CRITICAL DIRECTIVE: The user expects a SINGLE-LINE completion or a partial line completion. You MUST NOT output any newline character. STOP IMMEDIATELY after writing the rest of the current line.';
}

function buildVscodeLmInlinePrompt(request: CompletionRequest): string {
  let prompt = buildCompletionPrompt(request);

  if (request.stopSequences?.includes('\n')) {
    prompt += `\n\n${buildVscodeLmStopDirective()}`;
  }

  return prompt;
}

function buildOllamaInlinePrompt(request: CompletionRequest): string {
  const contextBlock = request.additionalContext
    ? `\nADDITIONAL_CONTEXT:\n${request.additionalContext}\n`
    : '\n';
  const currentBlock = request.currentBlockContext
    ? `CURRENT_BLOCK:\n${request.currentBlockContext}\n\n`
    : '';
  const completionHint = request.mode === 'automatic'
    ? 'Prefer the shortest correct completion.'
    : 'Stop when the requested completion is finished.';

  return `Return only the missing code at the cursor.${contextBlock}${currentBlock}Language: ${request.language}
File: ${request.filename}

<CONTEXT_BEFORE>${request.prefix}</CONTEXT_BEFORE><CURSOR><CONTEXT_AFTER>${request.suffix}</CONTEXT_AFTER>

Rules:
- Output code only.
- Do not repeat surrounding text.
- ${request.currentBlockContext ? 'Do not repeat code that already exists in the current block.' : 'Stay consistent with the current local code context.'}
- ${request.currentBlockContext ? 'Continue the current function or block naturally.' : 'Continue the current code naturally.'}
- Do not output unrelated prose or standalone string literals.
- Do not use markdown or explanations.
- ${completionHint}`;
}

function resolveAutomaticCap(
  request: CompletionRequest,
  automaticCap: number
): number {
  const requestedMaxTokens = request.maxTokens ?? DEFAULT_INLINE_MAX_TOKENS;

  if (request.mode !== 'automatic') {
    return requestedMaxTokens;
  }

  return Math.min(requestedMaxTokens, automaticCap);
}

export function buildInlineCompletionConfig(
  providerId: ProviderId,
  request: CompletionRequest
): ResolvedInlineCompletionConfig {
  if (isInlineChatRequest(request)) {
    return {
      strategyId: 'shared-chat',
      prompt: buildCompletionPrompt(request),
      maxTokens: request.maxTokens ?? DEFAULT_INLINE_MAX_TOKENS,
      stopSequences: request.stopSequences,
    };
  }

  const strategyId = getInlineStrategyId(providerId);

  switch (strategyId) {
    case 'vscode-lm':
      return {
        strategyId,
        prompt: buildVscodeLmInlinePrompt(request),
        maxTokens: resolveAutomaticCap(request, VSCODE_LM_AUTOMATIC_MAX_TOKENS),
        stopSequences: undefined,
      };
    case 'ollama': {
      const ollamaAutomaticCap =
        request.inlineOptimizationProfile === 'remote-ollama'
          ? REMOTE_OLLAMA_AUTOMATIC_MAX_TOKENS
          : OLLAMA_AUTOMATIC_MAX_TOKENS;

      return {
        strategyId,
        prompt: buildOllamaInlinePrompt(request),
        maxTokens: resolveAutomaticCap(request, ollamaAutomaticCap),
        stopSequences: request.stopSequences,
      };
    }
    case 'chat':
    default:
      return {
        strategyId,
        prompt: buildCompletionPrompt(request),
        maxTokens: request.maxTokens ?? DEFAULT_INLINE_MAX_TOKENS,
        stopSequences: request.stopSequences,
      };
  }
}
