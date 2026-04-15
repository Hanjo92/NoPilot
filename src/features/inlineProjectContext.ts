export interface BuildCurrentFileStructureContextInput {
  filename: string;
  text: string;
  maxEntries?: number;
  maxChars?: number;
}

export interface SimilarFileCandidate {
  uri: string;
  filename: string;
  language: string;
  text: string;
  isOpen: boolean;
}

export interface SelectSimilarFileSampleContextInput {
  currentUri: string;
  currentFilename: string;
  language: string;
  referencedWords: string[];
  candidates: SimilarFileCandidate[];
  maxChars?: number;
}

export interface SimilarFileSampleSelection {
  value: string;
  selectedUri?: string;
}

type DeclarationKind = 'type' | 'constructor' | 'callable';

interface DeclarationEntry {
  line: string;
  lineNumber: number;
  kind: DeclarationKind;
}

const DEFAULT_STRUCTURE_MAX_ENTRIES = 8;
const DEFAULT_STRUCTURE_MAX_CHARS = 640;
const DEFAULT_SIMILAR_SAMPLE_MAX_CHARS = 860;
const DEFAULT_SIMILAR_SAMPLE_WINDOW_LINES = 14;
const GENERIC_CONTEXT_TOKENS = new Set([
  'page',
  'widget',
  'state',
  'screen',
  'view',
  'component',
  'helper',
  'utils',
  'util',
  'index',
  'test',
]);

function tokenizeWords(input: string): string[] {
  return input
    .replace(/\.[^.]+$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 3 && !GENERIC_CONTEXT_TOKENS.has(token));
}

function uniqueNonEmpty(lines: string[]): string[] {
  return Array.from(
    new Set(
      lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    )
  );
}

function normalizeDeclarationLine(line: string): string {
  return line
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\{$/, '')
    .replace(/\s*=>\s*$/, ' =>');
}

function isControlStatement(line: string): boolean {
  return /^(?:if|for|while|switch|catch|else|do|try|return|setState)\b/.test(line);
}

function detectDeclarationKind(line: string): DeclarationKind | undefined {
  if (line.length === 0 || isControlStatement(line)) {
    return undefined;
  }

  if (
    /^(?:abstract\s+)?class\b/.test(line) ||
    /^(?:interface|enum|typedef|mixin|extension)\b/.test(line)
  ) {
    return 'type';
  }

  if (/^(?:const|final|factory)\s+[A-Za-z_][\w$]*\s*\([^)]*\)\s*;?$/.test(line)) {
    return 'constructor';
  }

  if (
    /^(?:async\s+)?(?:static\s+)?(?:override\s+)?(?:const\s+)?(?:final\s+)?(?:[A-Za-z_<>[\]?.,]+\s+)+[A-Za-z_$][\w$]*\s*\([^;=]*\)\s*(?:=>)?$/.test(
      line
    )
  ) {
    return 'callable';
  }

  return undefined;
}

function collectDeclarationEntries(text: string): DeclarationEntry[] {
  const results: DeclarationEntry[] = [];
  const lines = text.split('\n');

  for (const [lineNumber, rawLine] of lines.entries()) {
    const line = normalizeDeclarationLine(rawLine);
    const kind = detectDeclarationKind(line);
    if (!kind) {
      continue;
    }

    results.push({ line, lineNumber, kind });
  }

  return results.filter(
    (entry, index, array) =>
      array.findIndex((candidate) => candidate.line === entry.line) === index
  );
}

function selectStructureEntries(
  declarations: DeclarationEntry[],
  maxEntries: number
): DeclarationEntry[] {
  const selected: DeclarationEntry[] = [];

  for (const kind of ['type', 'constructor', 'callable'] as const) {
    for (const entry of declarations) {
      if (selected.length >= maxEntries) {
        break;
      }

      if (
        entry.kind === kind &&
        !selected.some((candidate) => candidate.lineNumber === entry.lineNumber)
      ) {
        selected.push(entry);
      }
    }
  }

  return selected.sort((left, right) => left.lineNumber - right.lineNumber);
}

function truncateContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 4).trimEnd()}\n...`;
}

function countKeywordMatches(haystack: string, keywords: string[]): number {
  const lowerHaystack = haystack.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    if (lowerHaystack.includes(keyword)) {
      score += 1;
    }
  }

  return score;
}

function buildSimilarFileSample(
  candidate: SimilarFileCandidate,
  keywords: string[],
  maxChars: number
): string {
  const declarations = collectDeclarationEntries(candidate.text);
  if (declarations.length === 0) {
    return '';
  }

  const anchor =
    declarations
      .map((entry) => ({
        entry,
        score:
          countKeywordMatches(entry.line, keywords) * 3 +
          (entry.kind === 'callable' ? 1 : 0),
      }))
      .sort((left, right) => right.score - left.score)[0]?.entry ?? declarations[0];

  if (!anchor) {
    return '';
  }

  const nearestType = [...declarations]
    .reverse()
    .find(
      (entry) => entry.kind === 'type' && entry.lineNumber <= anchor.lineNumber
    );
  const lines = candidate.text.split('\n');
  const startLine = Math.max(
    0,
    nearestType && anchor.lineNumber - nearestType.lineNumber <= 12
      ? nearestType.lineNumber
      : anchor.lineNumber - 2
  );
  const endLine = Math.min(
    lines.length,
    Math.max(anchor.lineNumber + DEFAULT_SIMILAR_SAMPLE_WINDOW_LINES, startLine + 6)
  );
  const snippet = lines.slice(startLine, endLine).join('\n').trim();

  return truncateContext(
    `// Similar file sample: ${candidate.filename}\n${snippet}`,
    maxChars
  );
}

export function extractContextKeywords(
  currentFilename: string,
  referencedWords: string[]
): string[] {
  return uniqueNonEmpty([
    ...tokenizeWords(currentFilename),
    ...referencedWords.flatMap((word) => tokenizeWords(word)),
  ]);
}

export function buildCurrentFileStructureContext(
  input: BuildCurrentFileStructureContextInput
): string {
  const declarations = selectStructureEntries(
    collectDeclarationEntries(input.text),
    input.maxEntries ?? DEFAULT_STRUCTURE_MAX_ENTRIES
  );

  if (declarations.length === 0) {
    return '';
  }

  const context = `// Current file structure: ${input.filename}\n${declarations
    .map((entry) => entry.line)
    .join('\n')}`;
  return truncateContext(context, input.maxChars ?? DEFAULT_STRUCTURE_MAX_CHARS);
}

export function selectSimilarFileSampleContext(
  input: SelectSimilarFileSampleContextInput
): SimilarFileSampleSelection {
  const keywords = extractContextKeywords(input.currentFilename, input.referencedWords);
  let bestCandidate: SimilarFileCandidate | undefined;
  let bestScore = 0;

  for (const candidate of input.candidates) {
    if (
      candidate.uri === input.currentUri ||
      candidate.language !== input.language ||
      candidate.text.trim().length === 0
    ) {
      continue;
    }

    const declarationSummary = buildCurrentFileStructureContext({
      filename: candidate.filename,
      text: candidate.text,
      maxEntries: 6,
      maxChars: input.maxChars ?? DEFAULT_SIMILAR_SAMPLE_MAX_CHARS,
    });

    if (!declarationSummary) {
      continue;
    }

    const filenameMatches = countKeywordMatches(candidate.filename, keywords);
    const summaryMatches = countKeywordMatches(declarationSummary, keywords);
    const score =
      (candidate.isOpen ? 3 : 0) +
      filenameMatches * 2 +
      summaryMatches;

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (!bestCandidate || bestScore < 4) {
    return { value: '' };
  }

  const summary = buildSimilarFileSample(
    bestCandidate,
    keywords,
    input.maxChars ?? DEFAULT_SIMILAR_SAMPLE_MAX_CHARS
  );

  return {
    value: summary,
    selectedUri: bestCandidate.uri,
  };
}
