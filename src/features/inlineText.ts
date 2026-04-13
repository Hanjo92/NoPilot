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

export interface InlineRequestPolicy {
  skip: boolean;
  includeAdditionalContext: boolean;
  maxTokens: number;
  maxPrefixLines?: number;
  maxSuffixLines?: number;
}

interface InlineRequestPolicyInput {
  isAutomaticTrigger: boolean;
  lineText: string;
  cursorCharacter: number;
}

const AUTOMATIC_INLINE_MAX_TOKENS = 96;
const EXPLICIT_INLINE_MAX_TOKENS = 256;
const AUTOMATIC_INLINE_MAX_PREFIX_LINES = 20;
const AUTOMATIC_INLINE_MAX_SUFFIX_LINES = 8;

export function getInlineRequestPolicy(
  input: InlineRequestPolicyInput
): InlineRequestPolicy {
  if (!input.isAutomaticTrigger) {
    return {
      skip: false,
      includeAdditionalContext: true,
      maxTokens: EXPLICIT_INLINE_MAX_TOKENS,
      maxPrefixLines: undefined,
      maxSuffixLines: undefined,
    };
  }

  const leftStr = input.lineText.substring(0, input.cursorCharacter);
  const rightStr = input.lineText.substring(input.cursorCharacter);

  if (rightStr.length > 0 && /^[a-zA-Z0-9_]/.test(rightStr)) {
    return {
      skip: true,
      includeAdditionalContext: false,
      maxTokens: AUTOMATIC_INLINE_MAX_TOKENS,
      maxPrefixLines: AUTOMATIC_INLINE_MAX_PREFIX_LINES,
      maxSuffixLines: AUTOMATIC_INLINE_MAX_SUFFIX_LINES,
    };
  }

  if (leftStr.trim().length > 0 && /[ \t]{2,}$/.test(leftStr)) {
    return {
      skip: true,
      includeAdditionalContext: false,
      maxTokens: AUTOMATIC_INLINE_MAX_TOKENS,
      maxPrefixLines: AUTOMATIC_INLINE_MAX_PREFIX_LINES,
      maxSuffixLines: AUTOMATIC_INLINE_MAX_SUFFIX_LINES,
    };
  }

  if (input.lineText.trim().length === 0) {
    return {
      skip: true,
      includeAdditionalContext: false,
      maxTokens: AUTOMATIC_INLINE_MAX_TOKENS,
      maxPrefixLines: AUTOMATIC_INLINE_MAX_PREFIX_LINES,
      maxSuffixLines: AUTOMATIC_INLINE_MAX_SUFFIX_LINES,
    };
  }

  if (leftStr.trim().length === 0 && leftStr.length > 20) {
    return {
      skip: true,
      includeAdditionalContext: false,
      maxTokens: AUTOMATIC_INLINE_MAX_TOKENS,
      maxPrefixLines: AUTOMATIC_INLINE_MAX_PREFIX_LINES,
      maxSuffixLines: AUTOMATIC_INLINE_MAX_SUFFIX_LINES,
    };
  }

  return {
    skip: false,
    includeAdditionalContext: false,
    maxTokens: AUTOMATIC_INLINE_MAX_TOKENS,
    maxPrefixLines: AUTOMATIC_INLINE_MAX_PREFIX_LINES,
    maxSuffixLines: AUTOMATIC_INLINE_MAX_SUFFIX_LINES,
  };
}

export function buildInlineCacheScope(providerId: string, model: string): string {
  return `${providerId}::${model || 'auto'}`;
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

export function trimSingleLineCompletion(text: string): string {
  return text.split('\n', 1)[0] || '';
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
