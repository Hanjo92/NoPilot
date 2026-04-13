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

interface InlineCompletionCleanupInput {
  text: string;
  prefix: string;
  suffix: string;
  stopSequences?: string[];
}

function isConversationalLeadIn(line: string): boolean {
  const trimmed = line.trim();

  return /^(sure|here(?:'s| is)|the (?:completion|code)|completion:|code:|try this:|use this:)/i.test(trimmed);
}

function removeConversationalLeadIn(text: string): string {
  const lines = text.split('\n');

  if (lines.length > 1 && isConversationalLeadIn(lines[0] || '')) {
    return lines.slice(1).join('\n').trimStart();
  }

  return text;
}

function removeTrailingExplanation(text: string): string {
  return text.replace(
    /\n{2,}(?:Explanation|Note|Reason|Why|This works because|This adds|This change)\b[\s\S]*$/i,
    ''
  );
}

function removePrefixOverlap(text: string, prefix: string): string {
  let cleaned = text;

  for (let i = Math.min(60, prefix.length); i > 0; i--) {
    const slice = prefix.slice(-i);
    if (cleaned.startsWith(slice)) {
      cleaned = cleaned.substring(slice.length);
      break;
    }
  }

  return cleaned;
}

function removeSuffixOverlap(text: string, suffix: string): string {
  let cleaned = text;

  for (let i = Math.min(60, suffix.length, cleaned.length); i > 0; i--) {
    const slice = suffix.slice(0, i);
    if (cleaned.endsWith(slice)) {
      cleaned = cleaned.substring(0, cleaned.length - slice.length);
      break;
    }
  }

  return cleaned;
}

function removeSuffixLineOverlap(text: string, suffix: string): string {
  let cleaned = text;
  const suffixLines = suffix.split('\n').map((l) => l.trim()).filter((l) => l.length > 5);

  if (suffixLines.length === 0) {
    return cleaned;
  }

  const cleanedLines = cleaned.split('\n');
  let truncateIdx = -1;
  for (let i = 0; i < cleanedLines.length; i++) {
    const lineTrim = cleanedLines[i].trim();
    if (lineTrim.length > 5 && suffixLines.includes(lineTrim)) {
      truncateIdx = i;
      break;
    }
  }

  if (truncateIdx !== -1) {
    cleaned = cleanedLines.slice(0, truncateIdx).join('\n');
  }

  return cleaned;
}

export function cleanInlineCompletionText(
  input: InlineCompletionCleanupInput
): string {
  let cleaned = stripMarkdownCodeFences(input.text.trimEnd());
  cleaned = removeConversationalLeadIn(cleaned);
  cleaned = removePrefixOverlap(cleaned, input.prefix);
  cleaned = removeSuffixOverlap(cleaned, input.suffix);
  cleaned = removeSuffixLineOverlap(cleaned, input.suffix);
  cleaned = removeTrailingExplanation(cleaned).trimEnd();

  if (input.stopSequences?.includes('\n')) {
    cleaned = trimSingleLineCompletion(cleaned);
  }

  return cleaned;
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
