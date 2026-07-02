import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readInlineStrategiesSource() {
  return readFileSync(
    path.resolve(process.cwd(), 'src/providers/inlineStrategies.ts'),
    'utf8'
  );
}

test('ollama inline strategy defangs exact NoPilot control tags inside dynamic context', () => {
  const source = readInlineStrategiesSource();

  assert.match(source, /import \{ buildCompletionPrompt, escapePromptControlTags \} from '\.\/prompts';/);
  assert.match(source, /ADDITIONAL_CONTEXT:\\n\$\{escapePromptControlTags\(request\.additionalContext\)\}\\n/);
  assert.match(source, /CURRENT_BLOCK:\\n\$\{escapePromptControlTags\(request\.currentBlockContext\)\}\\n\\n/);
  assert.match(source, /<CONTEXT_BEFORE>\$\{escapePromptControlTags\(request\.prefix\)\}<\/CONTEXT_BEFORE><CURSOR><CONTEXT_AFTER>\$\{escapePromptControlTags\(request\.suffix\)\}<\/CONTEXT_AFTER>/);
});
