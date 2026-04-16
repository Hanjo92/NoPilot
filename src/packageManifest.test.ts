import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface ExtensionManifest {
  activationEvents?: string[];
  galleryBanner?: {
    color?: string;
  };
  icon?: string;
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

test('manifest includes marketplace icon metadata', () => {
  const manifest = readManifest();

  assert.equal(manifest.icon, 'media/icon.png');
  assert.equal(manifest.galleryBanner?.color, '#2563eb');
  assert.ok(existsSync(path.resolve(process.cwd(), manifest.icon ?? '')));
});
