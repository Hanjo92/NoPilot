import { getSettingsWebviewBody } from './settingsWebviewBody';
import { getSettingsWebviewScript } from './settingsWebviewScript';
import { getSettingsWebviewStyles } from './settingsWebviewStyles';

function indentBlock(text: string, indent = '    '): string {
  return text
    .split('\n')
    .map(line => `${indent}${line}`)
    .join('\n');
}

export { getSettingsWebviewBody, getSettingsWebviewScript, getSettingsWebviewStyles };

export function getSettingsWebviewHtml(nonce: string): string {
  const body = indentBlock(getSettingsWebviewBody(), '  ');
  const styles = indentBlock(getSettingsWebviewStyles());
  const script = indentBlock(getSettingsWebviewScript());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>NoPilot Settings</title>
  <style nonce="${nonce}">
${styles}
  </style>
</head>
<body>
${body}

  <script nonce="${nonce}">
${script}
  </script>
</body>
</html>`;
}

export function createNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
