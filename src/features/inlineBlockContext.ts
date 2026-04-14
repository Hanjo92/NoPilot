const CURRENT_BLOCK_CURSOR_MARKER = '<CURRENT_CURSOR>';
const DEFAULT_MAX_BLOCK_CONTEXT_CHARS = 1200;

function findContainingOpenBrace(text: string, cursorOffset: number): number {
  let depth = 0;

  for (let i = cursorOffset - 1; i >= 0; i--) {
    const char = text[i];

    if (char === '}') {
      depth += 1;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        return i;
      }

      depth -= 1;
    }
  }

  return -1;
}

function findMatchingCloseBrace(text: string, openBraceIndex: number): number {
  let depth = 0;

  for (let i = openBraceIndex + 1; i < text.length; i++) {
    const char = text[i];

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth === 0) {
        return i;
      }

      depth -= 1;
    }
  }

  return -1;
}

function truncateAroundMarker(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  const markerIndex = text.indexOf(CURRENT_BLOCK_CURSOR_MARKER);
  if (markerIndex === -1) {
    return text.slice(0, maxChars);
  }

  const afterBudget = Math.max(
    120,
    Math.floor((maxChars - CURRENT_BLOCK_CURSOR_MARKER.length) * 0.25)
  );
  const beforeBudget = Math.max(
    0,
    maxChars - CURRENT_BLOCK_CURSOR_MARKER.length - afterBudget
  );
  const start = Math.max(0, markerIndex - beforeBudget);
  const end = Math.min(
    text.length,
    markerIndex + CURRENT_BLOCK_CURSOR_MARKER.length + afterBudget
  );

  let truncated = text.slice(start, end);

  if (start > 0) {
    truncated = `...\n${truncated}`;
  }

  if (end < text.length) {
    truncated = `${truncated}\n...`;
  }

  return truncated;
}

export function extractCurrentBlockContext(
  text: string,
  cursorOffset: number,
  maxChars = DEFAULT_MAX_BLOCK_CONTEXT_CHARS
): string | undefined {
  if (cursorOffset < 0 || cursorOffset > text.length) {
    return undefined;
  }

  const openBraceIndex = findContainingOpenBrace(text, cursorOffset);
  if (openBraceIndex === -1) {
    return undefined;
  }

  const closeBraceIndex = findMatchingCloseBrace(text, openBraceIndex);
  const blockEnd = closeBraceIndex === -1 ? text.length : closeBraceIndex + 1;
  const context =
    text.slice(openBraceIndex, cursorOffset) +
    CURRENT_BLOCK_CURSOR_MARKER +
    text.slice(cursorOffset, blockEnd);

  return truncateAroundMarker(context, maxChars);
}
