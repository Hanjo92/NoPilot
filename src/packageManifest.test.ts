import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface ExtensionManifest {
  activationEvents?: string[];
  description?: string;
  keywords?: string[];
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
    viewsContainers?: {
      activitybar?: Array<{
        id?: string;
        title?: string;
        icon?: string;
      }>;
    };
    views?: Record<string, Array<{
      id?: string;
      name?: string;
    }>>;
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

function readVsCodeIgnore(): string {
  return readFileSync(path.resolve(process.cwd(), '.vscodeignore'), 'utf8');
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

test('manifest marketplace copy reflects current NoPilot workflow', () => {
  const manifest = readManifest();

  assert.match(manifest.description ?? '', /Provider-switching AI coding/);
  assert.match(manifest.description ?? '', /chat panel/);
  assert.ok(manifest.keywords?.includes('provider switcher'));
  assert.ok(manifest.keywords?.includes('activity bar'));
  assert.ok(manifest.keywords?.includes('chat panel'));
  assert.ok(manifest.keywords?.includes('usage dashboard'));
});

test('manifest contributes NoPilot activity bar menu and chat views', () => {
  const manifest = readManifest();
  const activityBarViews = manifest.contributes?.viewsContainers?.activitybar ?? [];
  const noPilotContainer = activityBarViews.find((view) => view.id === 'nopilot');
  const noPilotViews = manifest.contributes?.views?.nopilot ?? [];

  assert.equal(noPilotContainer?.title, 'NoPilot');
  assert.equal(noPilotContainer?.icon, 'media/nopilot-activity.svg');
  assert.ok(existsSync(path.resolve(process.cwd(), noPilotContainer?.icon ?? '')));
  assert.ok(noPilotViews.some((view) => view.id === 'nopilot.chatView' && view.name === 'Chat'));
  assert.ok(noPilotViews.some((view) => view.id === 'nopilot.menu' && view.name === 'Menu'));
});

test('package ignore excludes internal planning artifacts', () => {
  const vscodeIgnore = readVsCodeIgnore();

  assert.match(vscodeIgnore, /^docs\/superpowers\/\*\*$/m);
  assert.match(vscodeIgnore, /^docs\/workpads\/\*\*$/m);
  assert.match(vscodeIgnore, /^\.superpowers\/\*\*$/m);
  assert.match(vscodeIgnore, /^\.worktrees\/\*\*$/m);
  assert.match(vscodeIgnore, /^GH-\*-\w+\.md$/m);
  assert.match(vscodeIgnore, /^GH-\*-\w+\.sh$/m);
  assert.match(vscodeIgnore, /^GH-\*-\w+\.test\.sh$/m);
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
  assert.equal(properties['nopilot.commitMessage.customPrompt']?.default, '');
  assert.match(
    properties['nopilot.commitMessage.customPrompt']?.description ?? '',
    /\{\{diff\}\}.*\{\{language\}\}/
  );
});

test('manifest copy reflects model-level selection behavior', () => {
  const manifest = readManifest();
  const commands = manifest.contributes?.commands ?? [];
  const properties = manifest.contributes?.configuration?.properties ?? {};
  const switchCommand = commands.find((command) => command.command === 'nopilot.switchProvider');
  const openChatCommand = commands.find((command) => command.command === 'nopilot.openChatPanel');

  assert.equal(switchCommand?.title, 'NoPilot: Select Provider / Model');
  assert.equal(openChatCommand?.title, 'NoPilot: Open Chat Panel');
  assert.equal(
    properties['nopilot.model']?.description,
    'Optional VS Code LM model key override. Leave empty to use the provider default or choose a model from NoPilot.'
  );
  assert.match(properties['nopilot.provider']?.description ?? '', /Activity Bar menu/);
});
