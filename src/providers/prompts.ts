import type { CompletionRequest, CommitMessageRequest } from '../types';

const PROMPT_CONTROL_TAGS = [
  'ADDITIONAL_CONTEXT',
  'CURRENT_BLOCK',
  'CHAT_HISTORY',
  'SELECTED_CODE',
  'WORKSPACE_CONTEXT',
  'EDITOR_CONTEXT',
  'CONTEXT_BEFORE',
  'CONTEXT_AFTER',
  'LATEST_USER_REQUEST',
  'SELECTION',
  'INSTRUCTION',
] as const;

export function escapePromptControlTags(text: string): string {
  let escaped = text;

  for (const tag of PROMPT_CONTROL_TAGS) {
    escaped = escaped
      .replaceAll(`<${tag}>`, `[${tag}]`)
      .replaceAll(`</${tag}>`, `[/${tag}]`);
  }

  return escaped;
}

function buildChatHistoryBlock(request: CompletionRequest): string {
  const chatHistory = request.chatHistory ?? [];

  if (chatHistory.length === 0) {
    return '';
  }

  const transcript = chatHistory
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}:\n${escapePromptControlTags(message.content)}`)
    .join('\n\n');

  return `\n<CHAT_HISTORY>\n${transcript}\n</CHAT_HISTORY>\n`;
}

function buildWorkspaceContextBlock(request: CompletionRequest): string {
  if (!request.workspaceContext?.trim()) {
    return '';
  }

  return `\n<WORKSPACE_CONTEXT>\n${escapePromptControlTags(request.workspaceContext)}\n</WORKSPACE_CONTEXT>\n`;
}

/**
 * Builds the prompt for inline code completion.
 * Uses a strict Fill-in-the-Middle (FIM) approach.
 */
export function buildCompletionPrompt(request: CompletionRequest): string {
  const contextBlock = request.additionalContext
    ? `\n<ADDITIONAL_CONTEXT>\n// Snippets from the project to provide context for variables and functions:\n${escapePromptControlTags(request.additionalContext)}\n</ADDITIONAL_CONTEXT>\n`
    : '';
  const currentBlock = request.currentBlockContext
    ? `\n<CURRENT_BLOCK>\n${escapePromptControlTags(request.currentBlockContext)}\n</CURRENT_BLOCK>\n`
    : '';
  const chatHistoryBlock = buildChatHistoryBlock(request);

  if (request.chatPrompt?.trim()) {
    const chatMode = request.chatMode === 'ask' ? 'ask' : 'agent';
    const selectionBlock = request.selection?.trim()
      ? `\n<SELECTED_CODE>\n${escapePromptControlTags(request.selection)}\n</SELECTED_CODE>\n`
      : '';
    const surroundingContextBlock =
      request.prefix || request.suffix
        ? `\n<EDITOR_CONTEXT>\n<CONTEXT_BEFORE>${escapePromptControlTags(request.prefix)}</CONTEXT_BEFORE>\n<CONTEXT_AFTER>${escapePromptControlTags(request.suffix)}</CONTEXT_AFTER>\n</EDITOR_CONTEXT>\n`
        : '';
    const workspaceContextBlock = buildWorkspaceContextBlock(request);

    if (chatMode === 'agent') {
      return `You are NoPilot Agent Mode, a coding agent responding inside a VS Code chat panel.
Use the current file, selection, recent transcript, and workspace context to produce actionable coding help.

File: ${request.filename} (${request.language})${selectionBlock}${surroundingContextBlock}${workspaceContextBlock}${chatHistoryBlock}
<LATEST_USER_REQUEST>
${escapePromptControlTags(request.chatPrompt)}
</LATEST_USER_REQUEST>

RULES:
1. Start with a short diagnosis or plan tailored to the latest request.
2. Be concrete about the files, functions, or edits you recommend.
3. If you propose code changes, include complete markdown code fences for the changed snippet.
4. When the context is incomplete, say exactly what additional file or runtime detail is missing.
5. Do not claim that you already changed files, ran commands, or verified behavior.
6. Prefer actionable next steps over broad explanations.`;
    }

    return `You are NoPilot, a coding assistant responding inside a VS Code chat panel.
Use the editor context when it is relevant, but answer the user's latest request directly.

File: ${request.filename} (${request.language})${selectionBlock}${surroundingContextBlock}${workspaceContextBlock}${chatHistoryBlock}
<LATEST_USER_REQUEST>
${escapePromptControlTags(request.chatPrompt)}
</LATEST_USER_REQUEST>

RULES:
1. Answer the latest user request directly.
2. If you provide code, wrap it in markdown code fences.
3. If the provided editor context is insufficient, say what is missing.
4. Do not claim that you already changed files or ran commands unless the user explicitly asked for a plan only.`;
  }

  if (request.instruction) {
    return `You are a strict code editing Assistant.
Your task is to modify the highly specific <SELECTION> code based on the user's <INSTRUCTION>.

File: ${request.filename} (${request.language})

<CONTEXT_BEFORE>${escapePromptControlTags(request.prefix)}</CONTEXT_BEFORE>
<SELECTION>
${escapePromptControlTags(request.selection || '')}
</SELECTION>
<CONTEXT_AFTER>${escapePromptControlTags(request.suffix)}</CONTEXT_AFTER>

<INSTRUCTION>
${escapePromptControlTags(request.instruction)}
</INSTRUCTION>

RULES:
1. ONLY return the new code that should replace the <SELECTION>.
2. Do NOT output the unmodified <CONTEXT_BEFORE> or <CONTEXT_AFTER>.
3. Do NOT wrap the answer in markdown code blocks (\`\`\`).
4. Do NOT explain your code. Just output the replaced code.
`;
  }

  if (request.mode === 'automatic') {
    return `Complete the code at <CURSOR>.
${contextBlock}${currentBlock}
Language: ${request.language}
File: ${request.filename}

<CONTEXT_BEFORE>${escapePromptControlTags(request.prefix)}</CONTEXT_BEFORE><CURSOR><CONTEXT_AFTER>${escapePromptControlTags(request.suffix)}</CONTEXT_AFTER>

Return only the code to insert.
Prefer the shortest correct completion.
Do not repeat surrounding text.
${request.currentBlockContext ? 'Do not repeat code that already exists in <CURRENT_BLOCK>.' : ''}
Do not use markdown or explanations.`;
  }

  return `You are a strict code completion Assistant. Your task is to provide ONLY the code that belongs at the <CURSOR> position.
${contextBlock}
File: ${request.filename} (${request.language})

<CONTEXT_BEFORE>${escapePromptControlTags(request.prefix)}</CONTEXT_BEFORE><CURSOR><CONTEXT_AFTER>${escapePromptControlTags(request.suffix)}</CONTEXT_AFTER>

RULES:
1. Output ONLY the new code that should replace <CURSOR>.
2. STOP GENERATING as soon as the logical completion (a single expression, line, or block) is finished. Do NOT predict the rest of the file.
3. NEVER repeat the code that is immediately before or after the <CURSOR>.
4. Do NOT wrap the answer in markdown code blocks (\`\`\`).
5. Do NOT explain your code.`;
}

/**
 * Builds the prompt for commit message generation.
 */
export function buildCommitMessagePrompt(request: CommitMessageRequest): string {
  const languageMap: Record<string, string> = {
    en: 'English',
    ko: 'Korean',
    ja: 'Japanese',
    zh: 'Chinese',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
  };
  const lang = languageMap[request.language] || request.language;

  if (request.customPrompt?.trim()) {
    const customPrompt = request.customPrompt
      .replaceAll('{{diff}}', request.diff)
      .replaceAll('{{language}}', lang);

    return `You are an expert at writing concise, descriptive Git commit messages.
Follow the user's custom instructions exactly and do not apply NoPilot's default format preset.

RULES:
- Return ONLY the commit message. No markdown, no backticks, no extra explanation.

Custom instructions:
${customPrompt}`;
  }

  const formatInstructions =
    request.format === 'conventional'
      ? `Follow the Conventional Commits format:
- First line: type(scope): imperative mood description (max 72 chars)
- Types: feat, fix, refactor, docs, style, test, chore, perf, build, ci
- Optionally add a blank line followed by bullet points for complex changes
- Scope is optional but recommended`
      : `Write a simple, clear commit message:
- First line: imperative mood description (max 72 chars)
- Optionally add details on the next lines`;

  return `You are an expert at writing concise, descriptive Git commit messages.
Analyze the following diff and generate a commit message.

${formatInstructions}

RULES:
- Write the message in ${lang}.
- Return ONLY the commit message. No markdown, no backticks, no extra explanation.
- Be specific about what changed, not generic.

Diff:
${request.diff}`;
}
