export function stripMarkdownCodeFences(text: string): string {
  let cleaned = text;
  const fenceMatch = cleaned.match(/^```[\w]*\n([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1];
  } else if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    lines.shift();
    if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
      lines.pop();
    }
    cleaned = lines.join('\n');
  }

  return cleaned;
}

export function extractReferencedWords(prefix: string): string[] {
  const recentPrefix = prefix.slice(-1000);
  const classRegex = /\b[A-Z][a-zA-Z0-9_]*\b/g;
  const words = new Set<string>();
  let match;

  while ((match = classRegex.exec(recentPrefix)) !== null) {
    const word = match[0];
    if (
      word.length > 3 &&
      !['String', 'Boolean', 'Int32', 'Task', 'Void', 'Object', 'Math'].includes(word)
    ) {
      words.add(word);
    }
  }

  return Array.from(words);
}

export function sliceLines(text: string, startLine: number, lineCount: number): string {
  return text.split('\n').slice(startLine, startLine + lineCount).join('\n');
}

export function getInlineStopSequences(
  currentLine: string,
  cursorCharacter: number
): string[] | undefined {
  const currentLineTrimmed = currentLine.trimEnd();
  const rightStrPos = currentLine.substring(cursorCharacter);
  const isMidLine = rightStrPos.trim().length > 0;
  const endsWithBlockStarter =
    currentLineTrimmed.endsWith('{') ||
    currentLineTrimmed.endsWith(':') ||
    currentLineTrimmed.endsWith('then') ||
    currentLineTrimmed.endsWith('else');

  if (isMidLine || (!endsWithBlockStarter && currentLine.trim().length > 0)) {
    return ['\n'];
  }

  return undefined;
}
