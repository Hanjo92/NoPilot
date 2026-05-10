import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface ExtensionManifest {
  activationEvents?: string[];
  contributes?: {
    commands?: Array<{
      command?: string;
      title?: string;
    }>;
    configuration?: {
      properties?: Record<string, {
        type?: string;
        enum?: string[];
        default?: string | number | boolean;
        description?: string;
      }>;
    };
  };
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

test('manifest exposes Ollama remote mode setting', () => {
  const manifest = readManifest();
  const setting = manifest.contributes?.configuration?.properties?.['nopilot.ollama.remoteMode'];

  assert.equal(setting?.type, 'string');
  assert.equal(setting?.default, 'auto');
  assert.deepEqual(setting?.enum, ['auto', 'forced-on', 'forced-off']);
});

test('manifest keeps inline debounce default at 500ms', () => {
  const manifest = readManifest();
  const setting = manifest.contributes?.configuration?.properties?.['nopilot.inline.debounceMs'];

  assert.equal(setting?.type, 'number');
  assert.equal(setting?.default, 500);
});

test('manifest keeps core inline and commit defaults aligned', () => {
  const properties = readManifest().contributes?.configuration?.properties ?? {};

  assert.equal(properties['nopilot.inline.enabled']?.default, true);
  assert.equal(properties['nopilot.inline.qualityProfile']?.default, 'balanced');
  assert.equal(properties['nopilot.inline.pauseWhenCopilotActive']?.default, true);
  assert.equal(properties['nopilot.inline.maxPrefixLines']?.default, 50);
  assert.equal(properties['nopilot.inline.maxSuffixLines']?.default, 20);
  assert.equal(properties['nopilot.commitMessage.language']?.default, 'en');
  assert.equal(properties['nopilot.commitMessage.format']?.default, 'conventional');
});

test('manifest copy reflects model-level selection behavior', () => {
  const manifest = readManifest();
  const commands = manifest.contributes?.commands ?? [];
  const properties = manifest.contributes?.configuration?.properties ?? {};
  const switchCommand = commands.find((command) => command.command === 'nopilot.switchProvider');

  assert.equal(switchCommand?.title, 'NoPilot: Select AI Model');
  assert.equal(
    properties['nopilot.model']?.description,
    'VS Code LM model key override (empty = provider default)'
  );
});
