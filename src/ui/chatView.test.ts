import assert from 'node:assert/strict';
import test from 'node:test';
import { getChatViewBody } from './chatViewBody';
import { getChatViewScript } from './chatViewScript';
import { getChatViewStyles } from './chatViewStyles';

test('chat view body exposes transcript, composer, and status regions', () => {
  const body = getChatViewBody();

  assert.match(body, /NoPilot Chat/);
  assert.match(body, /id="chatTranscript"/);
  assert.match(body, /id="chatComposer"/);
  assert.match(body, /id="providerLabel"/);
  assert.match(body, /id="contextLabel"/);
  assert.match(body, /id="clearChatButton"/);
});

test('chat view styles cover transcript cards and responsive layout', () => {
  const styles = getChatViewStyles();

  assert.match(styles, /\.chat-shell/);
  assert.match(styles, /\.status-panel/);
  assert.match(styles, /\.chat-message\.assistant/);
  assert.match(styles, /\.message-content/);
  assert.match(styles, /resize: vertical/);
  assert.match(styles, /@media \(max-width: 720px\)/);
});

test('chat view script wires request, submit, clear, and apply flows', () => {
  const script = getChatViewScript();

  assert.match(script, /vscode\.postMessage\(\{ command: 'requestState' \}\)/);
  assert.match(script, /command: 'submitChat'/);
  assert.match(script, /command: 'clearChat'/);
  assert.match(script, /command: 'applyResponse'/);
  assert.match(script, /function renderTranscript/);
  assert.match(script, /function renderMessage/);
  assert.match(script, /Insert/);
  assert.match(script, /Replace Selection/);
  assert.match(script, /event\.key !== 'Enter'/);
  assert.doesNotMatch(script, /onclick=/);
});
