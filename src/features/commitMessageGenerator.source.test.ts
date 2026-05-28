import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readCommitMessageGeneratorSource(): string {
  return readFileSync(
    path.resolve(process.cwd(), 'src/features/commitMessageGenerator.ts'),
    'utf8'
  );
}

test('commit message generator reads custom prompt config and forwards it in the request', () => {
  const source = readCommitMessageGeneratorSource();

  assert.match(source, /const configuredCustomPrompt = config\.get<string>\('customPrompt', ''\);/);
  assert.match(source, /configuredCustomPrompt\.trim\(\)\.length > 0 \? configuredCustomPrompt : undefined;/);
  assert.match(source, /const request: CommitMessageRequest = \{ diff, language, format, customPrompt \};/);
});
