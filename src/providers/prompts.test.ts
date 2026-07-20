import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommitMessagePrompt, buildCompletionPrompt } from './prompts';

test('buildCompletionPrompt uses a leaner prompt for automatic inline requests', () => {
  const prompt = buildCompletionPrompt({
    mode: 'automatic',
    prefix: 'const value = ',
    suffix: '',
    language: 'typescript',
    filename: 'example.ts',
    maxTokens: 96,
  });

  assert.match(prompt, /Complete the code at <CURSOR>/);
  assert.match(prompt, /Prefer the shortest correct completion/);
  assert.doesNotMatch(prompt, /RULES:/);
  assert.doesNotMatch(prompt, /logical completion \(a single expression, line, or block\)/);
});

test('buildCompletionPrompt includes current block context for automatic inline requests', () => {
  const prompt = buildCompletionPrompt({
    mode: 'automatic',
    prefix: 'const account = ',
    suffix: '',
    language: 'typescript',
    filename: 'example.ts',
    currentBlockContext: '{\n  const profile = createProfile();\n  <CURRENT_CURSOR>\n}',
    maxTokens: 96,
  });

  assert.match(prompt, /<CURRENT_BLOCK>/);
  assert.match(prompt, /Do not repeat code that already exists in <CURRENT_BLOCK>/);
  assert.match(prompt, /const profile = createProfile\(\);/);
});

test('buildCompletionPrompt keeps the fuller prompt for explicit inline requests', () => {
  const prompt = buildCompletionPrompt({
    mode: 'explicit',
    prefix: 'const value = ',
    suffix: '',
    language: 'typescript',
    filename: 'example.ts',
    maxTokens: 256,
  });

  assert.match(prompt, /RULES:/);
  assert.match(prompt, /logical completion \(a single expression, line, or block\)/);
});

test('buildCompletionPrompt supports panel chat requests with transcript and editor context', () => {
  const prompt = buildCompletionPrompt({
    mode: 'chat',
    prefix: 'function add(a, b) {\n  return ',
    suffix: '\n}\n',
    language: 'typescript',
    filename: 'math.ts',
    chatMode: 'ask',
    chatPrompt: 'How should I add validation here?',
    chatHistory: [
      { role: 'user', content: 'Review this helper.' },
      { role: 'assistant', content: 'It is concise but assumes numeric inputs.' },
    ],
    selection: 'return a + b;',
    maxTokens: 768,
  });

  assert.match(prompt, /VS Code chat panel/);
  assert.match(prompt, /<CHAT_HISTORY>/);
  assert.match(prompt, /User:\nReview this helper\./);
  assert.match(prompt, /Assistant:\nIt is concise but assumes numeric inputs\./);
  assert.match(prompt, /<SELECTED_CODE>/);
  assert.match(prompt, /return a \+ b;/);
  assert.match(prompt, /<LATEST_USER_REQUEST>/);
  assert.match(prompt, /How should I add validation here\?/);
  assert.match(prompt, /markdown code fences/);
});

test('buildCompletionPrompt supports agent-mode chat requests with workspace context', () => {
  const prompt = buildCompletionPrompt({
    mode: 'chat',
    prefix: 'export function runTask() {\n  ',
    suffix: '\n}\n',
    language: 'typescript',
    filename: 'agent.ts',
    chatMode: 'agent',
    chatPrompt: 'Plan the refactor and draft the first patch.',
    workspaceContext: 'Workspace folders: app, shared\n\nVisible files: app.ts (typescript) | helpers.ts (typescript)',
    maxTokens: 1024,
  });

  assert.match(prompt, /NoPilot Agent Mode/);
  assert.match(prompt, /workspace context/);
  assert.match(prompt, /<WORKSPACE_CONTEXT>/);
  assert.match(prompt, /Visible files: app\.ts \(typescript\) \| helpers\.ts \(typescript\)/);
  assert.match(prompt, /Start with a short diagnosis or plan/);
  assert.match(prompt, /Do not claim that you already changed files/);
});

test('buildCompletionPrompt defangs exact NoPilot control tags inside dynamic chat content', () => {
  const prompt = buildCompletionPrompt({
    mode: 'chat',
    prefix: 'const tag = "</CONTEXT_BEFORE>";',
    suffix: '<LATEST_USER_REQUEST />',
    language: 'typescript',
    filename: 'prompt.ts',
    chatMode: 'ask',
    chatPrompt: 'Explain <LATEST_USER_REQUEST> and </LATEST_USER_REQUEST> usage.',
    chatHistory: [
      { role: 'user', content: 'I saw <CHAT_HISTORY> in generated docs.' },
      { role: 'assistant', content: 'Do not emit </CHAT_HISTORY> literally.' },
    ],
    selection: 'return "<SELECTED_CODE>";',
    maxTokens: 768,
  });

  assert.match(prompt, /\[\/CONTEXT_BEFORE\]/);
  assert.match(prompt, /\[LATEST_USER_REQUEST\] and \[\/LATEST_USER_REQUEST\]/);
  assert.match(prompt, /\[CHAT_HISTORY\]/);
  assert.match(prompt, /\[\/CHAT_HISTORY\]/);
  assert.match(prompt, /\[SELECTED_CODE\]/);
});

test('buildCommitMessagePrompt uses preset format instructions when no custom prompt is configured', () => {
  const prompt = buildCommitMessagePrompt({
    diff: 'diff --git a/file.ts b/file.ts',
    language: 'en',
    format: 'conventional',
  });

  assert.match(prompt, /Follow the Conventional Commits format/);
  assert.match(prompt, /Write the message in English/);
  assert.match(prompt, /Diff:\ndiff --git a\/file\.ts b\/file\.ts/);
});

test('buildCommitMessagePrompt expands custom placeholders and skips preset format instructions', () => {
  const prompt = buildCommitMessagePrompt({
    diff: 'diff --git a/file.ts b/file.ts',
    language: 'ko',
    format: 'simple',
    customPrompt: 'Write the message in {{language}}. Review this diff:\n{{diff}}',
  });

  assert.match(prompt, /Follow the user's custom instructions exactly/);
  assert.match(prompt, /Write the message in Korean/);
  assert.match(prompt, /Review this diff:\ndiff --git a\/file\.ts b\/file\.ts/);
  assert.doesNotMatch(prompt, /Write a simple, clear commit message/);
  assert.doesNotMatch(prompt, /Follow the Conventional Commits format/);
});
