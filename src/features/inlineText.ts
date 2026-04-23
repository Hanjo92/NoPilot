import type {
  InlineOptimizationProfile,
  InlineQualityProfile,
} from '../types';

export type AdditionalContextScope = 'none' | 'file' | 'workspace';

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
  additionalContextScope: AdditionalContextScope;
  maxTokens: number;
  maxPrefixLines?: number;
  maxSuffixLines?: number;
}

interface InlineRequestPolicyInput {
  isAutomaticTrigger: boolean;
  qualityProfile?: InlineQualityProfile;
  inlineOptimizationProfile?: InlineOptimizationProfile;
  lineText: string;
  cursorCharacter: number;
}

const EXPLICIT_INLINE_MAX_TOKENS = 256;

interface AutomaticInlineProfile {
  includeAdditionalContext: boolean;
  maxTokens: number;
  allowIndentedBlankLine: boolean;
  maxBlankLineIndent: number;
}

const AUTOMATIC_INLINE_PROFILES: Record<InlineQualityProfile, AutomaticInlineProfile> = {
  fast: {
    includeAdditionalContext: false,
    maxTokens: 64,
    allowIndentedBlankLine: false,
    maxBlankLineIndent: 8,
  },
  balanced: {
    includeAdditionalContext: false,
    maxTokens: 96,
    allowIndentedBlankLine: true,
    maxBlankLineIndent: 20,
  },
  rich: {
    includeAdditionalContext: true,
    maxTokens: 192,
    allowIndentedBlankLine: true,
    maxBlankLineIndent: 12,
  },
};

function normalizeInlineQualityProfile(
  qualityProfile: InlineQualityProfile | undefined
): InlineQualityProfile {
  return qualityProfile === 'fast' || qualityProfile === 'rich'
    ? qualityProfile
    : 'balanced';
}

function buildAutomaticInlinePolicy(
  profile: AutomaticInlineProfile,
  skip: boolean,
  inlineOptimizationProfile: InlineOptimizationProfile = 'standard'
): InlineRequestPolicy {
  if (inlineOptimizationProfile === 'remote-ollama') {
    return {
      skip,
      includeAdditionalContext: true,
      additionalContextScope: 'file',
      maxTokens: 64,
      maxPrefixLines: 30,
      maxSuffixLines: 10,
    };
  }

  return {
    skip,
    includeAdditionalContext: profile.includeAdditionalContext,
    additionalContextScope: profile.includeAdditionalContext ? 'workspace' : 'none',
    maxTokens: profile.maxTokens,
    maxPrefixLines: undefined,
    maxSuffixLines: undefined,
  };
}

interface LineContextAnalysis {
  insideString: boolean;
  insideComment: boolean;
}

function analyzeLineContext(lineText: string, cursorCharacter: number): LineContextAnalysis {
  const limit = Math.max(0, Math.min(cursorCharacter, lineText.length));
  let activeQuote: '"' | "'" | '`' | null = null;
  let escapeNext = false;
  let insideBlockComment = false;

  for (let i = 0; i < limit; i++) {
    const char = lineText[i];
    const nextChar = i + 1 < limit ? lineText[i + 1] : '';

    if (insideBlockComment) {
      if (char === '*' && nextChar === '/') {
        insideBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (activeQuote) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === activeQuote) {
        activeQuote = null;
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      return { insideString: false, insideComment: true };
    }

    if (char === '/' && nextChar === '*') {
      insideBlockComment = true;
      i += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      activeQuote = char;
    }
  }

  return {
    insideString: activeQuote !== null,
    insideComment: insideBlockComment,
  };
}

function isImportStatementPrefix(leftStr: string): boolean {
  const trimmed = leftStr.trimStart();

  return /^import\b/.test(trimmed) || /^export\s+(?:\*|\{)/.test(trimmed);
}

function getTrailingToken(leftStr: string): string {
  const trimmed = leftStr.trimEnd();

  if (trimmed.length === 0) {
    return '';
  }

  return trimmed.match(/(\S+)$/)?.[1] ?? '';
}

function isMemberAccessChainingState(trailingToken: string): boolean {
  if (trailingToken.length === 0) {
    return false;
  }

  return (
    /[A-Za-z0-9_$)\]]\.$/.test(trailingToken) ||
    /[A-Za-z0-9_$)\]]\?\.$/.test(trailingToken) ||
    /[A-Za-z0-9_$]+::$/.test(trailingToken)
  );
}

function isLowSignalChainingState(trailingToken: string): boolean {
  if (trailingToken.length === 0) {
    return false;
  }

  return /^[()[\]{}.,:;!?]+$/.test(trailingToken) || trailingToken.endsWith('?.') || trailingToken.endsWith('.') || trailingToken.endsWith('::');
}

export function getInlineRequestPolicy(
  input: InlineRequestPolicyInput
): InlineRequestPolicy {
  if (!input.isAutomaticTrigger) {
    return {
      skip: false,
      includeAdditionalContext: true,
      additionalContextScope: 'workspace',
      maxTokens: EXPLICIT_INLINE_MAX_TOKENS,
      maxPrefixLines: undefined,
      maxSuffixLines: undefined,
    };
  }

  const profile = AUTOMATIC_INLINE_PROFILES[
    normalizeInlineQualityProfile(input.qualityProfile)
  ];
  const leftStr = input.lineText.substring(0, input.cursorCharacter);
  const rightStr = input.lineText.substring(input.cursorCharacter);
  const lineContext = analyzeLineContext(input.lineText, input.cursorCharacter);
  const trailingToken = getTrailingToken(leftStr);
  const allowMemberAccessChaining =
    input.qualityProfile !== 'fast' && isMemberAccessChainingState(trailingToken);

  if (lineContext.insideComment || lineContext.insideString) {
    return buildAutomaticInlinePolicy(profile, true, input.inlineOptimizationProfile);
  }

  if (isImportStatementPrefix(leftStr)) {
    return buildAutomaticInlinePolicy(profile, true, input.inlineOptimizationProfile);
  }

  if (isLowSignalChainingState(trailingToken) && !allowMemberAccessChaining) {
    return buildAutomaticInlinePolicy(profile, true, input.inlineOptimizationProfile);
  }

  if (rightStr.length > 0 && /^[a-zA-Z0-9_]/.test(rightStr)) {
    return buildAutomaticInlinePolicy(profile, true, input.inlineOptimizationProfile);
  }

  if (leftStr.trim().length > 0 && /[ \t]{2,}$/.test(leftStr)) {
    return buildAutomaticInlinePolicy(profile, true, input.inlineOptimizationProfile);
  }

  if (input.lineText.trim().length === 0) {
    const allowIndentedBlankLine =
      profile.allowIndentedBlankLine &&
      leftStr.length > 0 &&
      leftStr.length <= profile.maxBlankLineIndent;

    return buildAutomaticInlinePolicy(profile, !allowIndentedBlankLine, input.inlineOptimizationProfile);
  }

  if (leftStr.trim().length === 0 && leftStr.length > profile.maxBlankLineIndent) {
    return buildAutomaticInlinePolicy(profile, true, input.inlineOptimizationProfile);
  }

  return buildAutomaticInlinePolicy(profile, false, input.inlineOptimizationProfile);
}

export function buildInlineCacheScope(
  providerId: string,
  model: string,
  qualityProfile: InlineQualityProfile,
  inlineOptimizationProfile: InlineOptimizationProfile = 'standard'
): string {
  return `${providerId}::${model || 'auto'}::${normalizeInlineQualityProfile(qualityProfile)}::${inlineOptimizationProfile}`;
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

function removeLeadingBlankLines(text: string): string {
  return text.replace(/^(?:[ \t]*\n)+[ \t]*/, '');
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

function removeTrailingNextStatement(text: string): string {
  const splitMatch = text.match(/^([\s\S]*?\})(?:\n\s*\n)([^\n][\s\S]*)$/);

  if (!splitMatch) {
    return text;
  }

  const completedBlock = splitMatch[1].trimEnd();
  const trailingSection = splitMatch[2].trimStart();
  const looksLikeNextStatement =
    /^(?:const|let|var|return|if|for|while|switch|try|throw|class|function|async\b|await\b|[A-Za-z_$][\w$]*\s*[=(.[])/.test(
      trailingSection
    );

  if (!looksLikeNextStatement) {
    return text;
  }

  return completedBlock;
}

export function cleanInlineCompletionText(
  input: InlineCompletionCleanupInput
): string {
  let cleaned = stripMarkdownCodeFences(input.text.trimEnd());
  cleaned = removeConversationalLeadIn(cleaned);
  cleaned = removePrefixOverlap(cleaned, input.prefix);
  cleaned = removeSuffixOverlap(cleaned, input.suffix);
  cleaned = removeSuffixLineOverlap(cleaned, input.suffix);
  cleaned = removeTrailingNextStatement(cleaned);
  cleaned = removeTrailingExplanation(cleaned).trimEnd();

  if (input.stopSequences?.includes('\n')) {
    cleaned = removeLeadingBlankLines(cleaned);
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
