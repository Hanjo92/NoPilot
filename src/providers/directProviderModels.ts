export type DirectProviderId = 'openai' | 'anthropic' | 'gemini';

type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}>;

interface ResolveDirectProviderModelStateInput {
  providerId: DirectProviderId;
  currentModel: string;
  liveModels?: string[];
}

const DIRECT_PROVIDER_FALLBACKS: Record<DirectProviderId, string[]> = {
  openai: [
    'gpt-5-mini',
    'gpt-5',
    'gpt-5-nano',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-4o',
    'gpt-4o-mini',
    'o4-mini',
  ],
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-opus-4-1-20250805',
    'claude-opus-4-20250514',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-haiku-20241022',
  ],
  gemini: [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite',
  ],
};

function uniqueNonEmpty(models: string[]): string[] {
  return Array.from(
    new Set(models.map((model) => model.trim()).filter((model) => model.length > 0))
  );
}

function sortByPreferredOrder(
  providerId: DirectProviderId,
  models: string[]
): string[] {
  const order = new Map(
    DIRECT_PROVIDER_FALLBACKS[providerId].map((model, index) => [model, index] as const)
  );

  return [...uniqueNonEmpty(models)].sort((left, right) => {
    const leftIndex = order.get(left);
    const rightIndex = order.get(right);

    if (leftIndex !== undefined && rightIndex !== undefined) {
      return leftIndex - rightIndex;
    }

    if (leftIndex !== undefined) {
      return -1;
    }

    if (rightIndex !== undefined) {
      return 1;
    }

    return left.localeCompare(right);
  });
}

async function parseJsonResponse<T>(
  response: Awaited<ReturnType<FetchLike>>
): Promise<T> {
  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(rawText || `${response.status} ${response.statusText}`);
  }

  return JSON.parse(rawText) as T;
}

function normalizeOpenAIModelId(id: string): string | undefined {
  if (
    /^(?:gpt-(?:5(?:\.\d+)?(?:-(?:mini|nano))?|4\.1(?:-(?:mini|nano))?|4o(?:-mini)?))$/.test(
      id
    ) ||
    /^o4-mini$/.test(id)
  ) {
    return id;
  }

  return undefined;
}

function normalizeAnthropicModelId(id: string): string | undefined {
  return /^claude-[a-z0-9-]+$/i.test(id) ? id : undefined;
}

function normalizeGeminiModelId(
  name: string,
  supportedGenerationMethods: string[] | undefined
): string | undefined {
  const modelId = name.replace(/^models\//, '');

  if (
    !modelId.startsWith('gemini-') ||
    !supportedGenerationMethods?.includes('generateContent') ||
    /(?:tts|image|imagen|embedding|aqa|live|audio)/i.test(modelId)
  ) {
    return undefined;
  }

  return modelId;
}

function buildFallbackState(
  providerId: DirectProviderId,
  currentModel: string
): { availableModels: string[]; currentModel: string } {
  const fallbackModels = getDirectProviderFallbackModels(providerId);
  const availableModels =
    currentModel && !fallbackModels.includes(currentModel)
      ? [currentModel, ...fallbackModels]
      : fallbackModels;

  return {
    availableModels,
    currentModel: currentModel || getDirectProviderDefaultModel(providerId),
  };
}

export function getDirectProviderFallbackModels(providerId: DirectProviderId): string[] {
  return [...DIRECT_PROVIDER_FALLBACKS[providerId]];
}

export function getDirectProviderDefaultModel(providerId: DirectProviderId): string {
  return DIRECT_PROVIDER_FALLBACKS[providerId][0];
}

export function resolveDirectProviderModelState(
  input: ResolveDirectProviderModelStateInput
): { availableModels: string[]; currentModel: string } {
  if (!input.liveModels || input.liveModels.length === 0) {
    return buildFallbackState(input.providerId, input.currentModel);
  }

  const availableModels = sortByPreferredOrder(input.providerId, input.liveModels);
  return {
    availableModels,
    currentModel:
      input.currentModel && availableModels.includes(input.currentModel)
        ? input.currentModel
        : availableModels[0] || getDirectProviderDefaultModel(input.providerId),
  };
}

export async function refreshOpenAIModelCatalog(
  apiKey: string,
  fetchFn: FetchLike = fetch
): Promise<string[]> {
  const response = await fetchFn('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const data = await parseJsonResponse<{ data?: Array<{ id?: string }> }>(response);

  return sortByPreferredOrder(
    'openai',
    (data.data ?? [])
      .map((entry) => normalizeOpenAIModelId(entry.id ?? ''))
      .filter((model): model is string => Boolean(model))
  );
}

export async function refreshAnthropicModelCatalog(
  apiKey: string,
  fetchFn: FetchLike = fetch
): Promise<string[]> {
  const response = await fetchFn('https://api.anthropic.com/v1/models', {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  const data = await parseJsonResponse<{ data?: Array<{ id?: string }> }>(response);

  return sortByPreferredOrder(
    'anthropic',
    (data.data ?? [])
      .map((entry) => normalizeAnthropicModelId(entry.id ?? ''))
      .filter((model): model is string => Boolean(model))
  );
}

export async function refreshGeminiModelCatalog(
  apiKey: string,
  fetchFn: FetchLike = fetch
): Promise<string[]> {
  const response = await fetchFn(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`,
    {
      method: 'GET',
    }
  );
  const data = await parseJsonResponse<{
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  }>(response);

  return sortByPreferredOrder(
    'gemini',
    (data.models ?? [])
      .map((entry) =>
        normalizeGeminiModelId(
          entry.name ?? '',
          entry.supportedGenerationMethods
        )
      )
      .filter((model): model is string => Boolean(model))
  );
}
