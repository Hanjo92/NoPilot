import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createNonce,
  getSettingsWebviewBody,
  getSettingsWebviewHtml,
  getSettingsWebviewScript,
  getSettingsWebviewStyles,
} from './settingsWebview';
import { getSettingsWebviewBody as getSettingsWebviewBodyFromModule } from './settingsWebviewBody';
import { getSettingsWebviewScript as getSettingsWebviewScriptFromModule } from './settingsWebviewScript';
import { getSettingsWebviewStyles as getSettingsWebviewStylesFromModule } from './settingsWebviewStyles';

test('createNonce returns a 32-character alphanumeric token', () => {
  const nonce = createNonce();

  assert.equal(nonce.length, 32);
  assert.match(nonce, /^[A-Za-z0-9]+$/);
});

test('getSettingsWebviewHtml includes required sections and CSP nonce wiring', () => {
  const nonce = 'abc123nonce';
  const html = getSettingsWebviewHtml(nonce);

  assert.match(html, /NoPilot Settings/);
  assert.match(html, /id="providerGrid"/);
  assert.match(html, /id="inlineSettings"/);
  assert.match(html, /id="commitSettings"/);
  assert.match(
    html,
    new RegExp(`content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"`)
  );
  assert.match(html, /vscode\.postMessage\(\{ command: 'requestState' \}\)/);
});

test('settings webview parts expose focused markup, styles, and script blocks', () => {
  const body = getSettingsWebviewBody();
  const styles = getSettingsWebviewStyles();
  const script = getSettingsWebviewScript();

  assert.match(body, /id="providerGrid"/);
  assert.match(body, /id="inlineSettings"/);
  assert.match(body, /id="ollamaSettings"/);
  assert.match(body, /id="commitSettings"/);
  assert.match(body, /NoPilot v0\.1\.0/);
  assert.match(body, /best-effort/);
  assert.match(body, /quota exhaustion or sign-in expiry/);

  assert.match(styles, /\.provider-grid/);
  assert.match(styles, /\.settings-section/);
  assert.match(styles, /\.footer/);
  assert.match(styles, /\.settings-note/);

  assert.match(script, /function renderProviders/);
  assert.match(script, /function getProviderStatusBadge/);
  assert.match(script, /function getProviderModelControl/);
  assert.match(script, /function getProviderActionsMarkup/);
  assert.doesNotMatch(script, /onclick=/);
  assert.doesNotMatch(script, /onchange=/);
  assert.doesNotMatch(script, /onkeydown=/);
  assert.match(script, /function ensureInteractionHandlersBound/);
  assert.match(script, /document\.addEventListener\('click'/);
  assert.match(script, /document\.addEventListener\('change'/);
  assert.match(script, /document\.addEventListener\('keydown'/);
  assert.match(script, /function renderInlineSettings/);
  assert.match(script, /const INLINE_SETTING_DEFINITIONS = \[/);
  assert.match(script, /inline\.pauseWhenCopilotActive/);
  assert.match(script, /function renderSettingRows/);
  assert.match(script, /function getInlineSettingsMarkup/);
  assert.match(script, /const COMMIT_LANGUAGE_OPTIONS = \[/);
  assert.match(script, /const COMMIT_FORMAT_OPTIONS = \[/);
  assert.match(script, /function getOllamaSettingsMarkup/);
  assert.match(script, /function getOllamaProvider/);
  assert.match(script, /function getOllamaStatusMarkup/);
  assert.match(script, /function getOllamaModelPreviewMarkup/);
  assert.match(script, /let ollamaRefreshPending = false/);
  assert.match(script, /let pendingOllamaEndpoint = ''/);
  assert.match(script, /Refreshing\.\.\./);
  assert.match(script, /ollama-model-preview/);
  assert.match(script, /id="ollamaEndpointInput"/);
  assert.match(script, /function refreshOllama/);
  assert.match(script, /const endpoint = getOllamaEndpointValue\(\);/);
  assert.match(script, /setOllamaRefreshPending\(true, endpoint\)/);
  assert.match(script, /endpointValue = ollamaRefreshPending && pendingOllamaEndpoint/);
  assert.match(script, /command: 'refreshOllama'/);
  assert.match(script, /function getCommitSettingsMarkup/);
  assert.match(script, /function updateSetting/);
});

test('settings webview script is also available from the dedicated script module', () => {
  assert.equal(getSettingsWebviewScript(), getSettingsWebviewScriptFromModule());
});

test('settings webview body and styles are also available from dedicated modules', () => {
  assert.equal(getSettingsWebviewBody(), getSettingsWebviewBodyFromModule());
  assert.equal(getSettingsWebviewStyles(), getSettingsWebviewStylesFromModule());
});
