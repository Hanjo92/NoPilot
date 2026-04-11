export const COPILOT_EXTENSION_ID = 'GitHub.copilot';

export interface NoPilotCopilotGuardState {
  isAutomaticTrigger: boolean;
  pauseWhenCopilotActive: boolean;
  editorInlineSuggestEnabled: boolean;
  copilotExtensionInstalled: boolean;
  copilotExtensionActive: boolean;
  copilotLanguageEnabled: boolean;
}

export function isCopilotEnabledForLanguage(
  enableSetting: unknown,
  languageId: string
): boolean {
  if (typeof enableSetting === 'boolean') {
    return enableSetting;
  }

  if (!enableSetting || typeof enableSetting !== 'object' || Array.isArray(enableSetting)) {
    return true;
  }

  const values = enableSetting as Record<string, unknown>;
  const wildcardEnabled = typeof values['*'] === 'boolean' ? values['*'] : true;
  const languageValue = values[languageId];

  return typeof languageValue === 'boolean' ? languageValue : wildcardEnabled;
}

export function shouldSkipNoPilotAutomaticInline(
  state: NoPilotCopilotGuardState
): boolean {
  return (
    state.isAutomaticTrigger &&
    state.pauseWhenCopilotActive &&
    state.editorInlineSuggestEnabled &&
    state.copilotExtensionInstalled &&
    state.copilotExtensionActive &&
    state.copilotLanguageEnabled
  );
}
