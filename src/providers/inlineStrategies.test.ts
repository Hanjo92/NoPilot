import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompletionRequest } from '../types';
import {
  buildInlineCompletionConfig,
  getInlineStrategyId,
} from './inlineStrategies';

function createInlineRequest(
  overrides: Partial<CompletionRequest> = {}
): CompletionRequest {
  return {
    mode: 'automatic',
    prefix: 'const value = ',
    suffix: '',
    language: 'typescript',
    filename: 'example.ts',
    stopSequences: ['\n'],
    maxTokens: 192,
    ...overrides,
  };
}

test('getInlineStrategyId maps providers to explicit strategy families', () => {
  assert.equal(getInlineStrategyId('openai'), 'chat');
  assert.equal(getInlineStrategyId('anthropic'), 'chat');
  assert.equal(getInlineStrategyId('gemini'), 'chat');
  assert.equal(getInlineStrategyId('vscode-lm'), 'vscode-lm');
  assert.equal(getInlineStrategyId('ollama'), 'ollama');
});

test('chat providers keep shared prompt style and transport stop settings', () => {
  const config = buildInlineCompletionConfig('openai', createInlineRequest({
    maxTokens: 96,
  }));

  assert.equal(config.strategyId, 'chat');
  assert.deepEqual(config.stopSequences, ['\n']);
  assert.equal(config.maxTokens, 96);
  assert.match(config.prompt, /Complete the code at <CURSOR>/);
});

test('vscode lm uses prompt-directed stopping instead of transport stop sequences', () => {
  const config = buildInlineCompletionConfig('vscode-lm', createInlineRequest());

  assert.equal(config.strategyId, 'vscode-lm');
  assert.equal(config.stopSequences, undefined);
  assert.equal(config.maxTokens, 128);
  assert.match(config.prompt, /CRITICAL DIRECTIVE/);
});

test('ollama uses a local inline prompt and tighter automatic token cap', () => {
  const config = buildInlineCompletionConfig('ollama', createInlineRequest({
    currentBlockContext: '{\n  setState(() {\n    _isSolved = true;\n  });\n  <CURRENT_CURSOR>\n}',
  }));

  assert.equal(config.strategyId, 'ollama');
  assert.deepEqual(config.stopSequences, ['\n']);
  assert.equal(config.maxTokens, 160);
  assert.match(config.prompt, /Return only the missing code at the cursor/);
  assert.match(config.prompt, /CURRENT_BLOCK/);
  assert.match(config.prompt, /Continue the current function or block naturally/);
  assert.match(config.prompt, /Do not repeat code that already exists in the current block/);
  assert.match(config.prompt, /Do not output unrelated prose or standalone string literals/);
});

test('inline chat requests fall back to shared prompt behavior for every provider', () => {
  const config = buildInlineCompletionConfig('ollama', createInlineRequest({
    mode: 'chat',
    instruction: 'Refactor to async',
    selection: 'runTask();',
    maxTokens: 500,
  }));

  assert.equal(config.strategyId, 'shared-chat');
  assert.equal(config.maxTokens, 500);
  assert.deepEqual(config.stopSequences, ['\n']);
  assert.match(config.prompt, /You are a strict code editing Assistant/);
});
