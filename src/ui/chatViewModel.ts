import type { ChatConversationMessage } from '../types';

export interface ChatTranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
}

const FIRST_MARKDOWN_CODE_BLOCK_PATTERN = /```[^\n]*\n([\s\S]*?)\n?```/;
const FULLY_FENCED_MARKDOWN_PATTERN = /^```[^\n]*\n([\s\S]*?)\n?```\s*$/;

function extractFirstMarkdownCodeBlock(text: string): string | undefined {
  return text.match(FIRST_MARKDOWN_CODE_BLOCK_PATTERN)?.[1];
}

function stripMarkdownCodeFences(text: string): string {
  const fenceMatch = text.match(FULLY_FENCED_MARKDOWN_PATTERN);
  if (fenceMatch) {
    return fenceMatch[1];
  }

  if (!text.startsWith('```')) {
    return text;
  }

  const lines = text.split('\n');
  lines.shift();
  if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
    lines.pop();
  }
  return lines.join('\n');
}

function trimSurroundingBlankLines(text: string): string {
  return text
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .replace(/(?:\r?\n[ \t]*)+$/, '');
}

export function buildChatRequestHistory(
  messages: readonly ChatTranscriptEntry[],
  limit = 10
): ChatConversationMessage[] {
  const history = messages
    .filter((message) => !message.pending)
    .map<ChatConversationMessage>((message) => ({
      role: message.role,
      content: message.content,
    }));

  const historyWithoutLatestPrompt = history[history.length - 1]?.role === 'user'
    ? history.slice(0, -1)
    : history;

  return historyWithoutLatestPrompt.slice(-limit);
}

export function normalizeAssistantResponseContent(content: string): string | undefined {
  const normalizedContent = trimSurroundingBlankLines(content);

  return normalizedContent.trim().length > 0
    ? normalizedContent
    : undefined;
}

export function normalizeChatResponseForApply(content: string): string | undefined {
  const extractedContent =
    extractFirstMarkdownCodeBlock(content) ?? stripMarkdownCodeFences(content);
  const normalizedContent = trimSurroundingBlankLines(extractedContent);

  return normalizedContent.trim().length > 0
    ? normalizedContent
    : undefined;
}
