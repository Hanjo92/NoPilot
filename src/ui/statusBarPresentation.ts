import type { InlineRequestStatus } from '../types';
import { getInlineRequestStatusMessage } from '../features/inlineRequestStatus';

export interface NoPilotStatusBarPresentationInput {
  displayName: string;
  providerName: string;
  model: string;
  currentProviderRequests: number;
  mostUsedProvider?: {
    providerName: string;
    requestCount: number;
  };
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
  const usageLabel = `${input.currentProviderRequests} req`;
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

  const tooltipLines = [
    `NoPilot — ${input.displayName}`,
    `Provider: ${input.providerName} | Model: ${input.model || 'auto'}`,
    `Usage this session: ${input.currentProviderRequests} request${input.currentProviderRequests === 1 ? '' : 's'}`,
    input.mostUsedProvider
      ? `Top provider: ${input.mostUsedProvider.providerName} (${input.mostUsedProvider.requestCount} request${input.mostUsedProvider.requestCount === 1 ? '' : 's'})`
      : 'Top provider: none yet',
    inlineStatus,
    requestMessage,
    'Click to select model',
  ].filter(Boolean);

  return {
    text: `${statusPrefix}$(sparkle) ${input.displayName} · ${usageLabel}`,
    tooltip: tooltipLines.join('\n'),
  };
}
