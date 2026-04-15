import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface ExtensionManifest {
  activationEvents?: string[];
}

function readManifest(): ExtensionManifest {
  const manifestPath = path.resolve(process.cwd(), 'package.json');
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as ExtensionManifest;
}

test('manifest activates on startup and first language editing sessions', () => {
  const manifest = readManifest();
  const activationEvents = manifest.activationEvents ?? [];

  assert.ok(activationEvents.includes('onStartupFinished'));
  assert.ok(activationEvents.includes('onLanguage'));
});
