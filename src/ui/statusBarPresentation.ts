import type { InlineRequestStatus } from '../types';
import { getInlineRequestStatusMessage } from '../features/inlineRequestStatus';

export interface NoPilotStatusBarPresentationInput {
  displayName: string;
  providerName: string;
  model: string;
  inlineEnabled: boolean;
  pausedForCopilot: boolean;
  requestStatus?: InlineRequestStatus;
}

export interface NoPilotStatusBarPresentation {
  text: string;
  tooltip: string;
}

export function getNoPilotStatusBarPresentation(
  input: NoPilotStatusBarPresentationInput
): NoPilotStatusBarPresentation {
  const requestMessage =
    input.inlineEnabled && !input.pausedForCopilot && input.requestStatus
      ? getInlineRequestStatusMessage(input.requestStatus)
      : '';

  const isRequestActive = Boolean(requestMessage);

  const statusPrefix = !input.inlineEnabled
    ? '$(circle-slash) '
    : input.pausedForCopilot
      ? '$(debug-pause) '
      : isRequestActive
        ? '$(sync~spin) '
        : '';

  const inlineStatus = !input.inlineEnabled
    ? 'Inline suggestions: disabled'
    : input.pausedForCopilot
      ? 'Inline suggestions: paused because GitHub Copilot is active for this language'
      : 'Inline suggestions: active';

  return {
    text: `${statusPrefix}$(sparkle) ${input.displayName}`,
    tooltip: `NoPilot — ${input.displayName}\nProvider: ${input.providerName} | Model: ${input.model || 'auto'}\n${inlineStatus}\n${requestMessage ? `\n${requestMessage}` : ''}\nClick to switch`,
  };
}
