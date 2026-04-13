interface OllamaTextResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}

type OllamaFetch = (
  url: string,
  init?: RequestInit
) => Promise<OllamaTextResponse>;

interface OllamaTagsResponse {
  models?: Array<{
    name: string;
    details?: {
      family?: string;
      families?: string[];
    };
  }>;
}

interface OllamaShowResponse {
  capabilities?: string[];
}

interface OllamaTagModel {
  name: string;
  details?: {
    family?: string;
    families?: string[];
  };
}

export function normalizeOllamaEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();

  if (!trimmed) {
    return 'http://localhost:11434';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, '');
  }

  return `http://${trimmed.replace(/\/+$/, '')}`;
}

export function buildOllamaGenerateOptions(input: {
  maxTokens: number;
  temperature: number;
  stopSequences?: string[];
}): {
  num_predict: number;
  temperature: number;
  stop?: string[];
} {
  const options: {
    num_predict: number;
    temperature: number;
    stop?: string[];
  } = {
    num_predict: input.maxTokens,
    temperature: input.temperature,
  };

  if (input.stopSequences?.length) {
    options.stop = input.stopSequences;
  }

  return options;
}

function buildOllamaUrl(endpoint: string, path: string): string {
  return `${normalizeOllamaEndpoint(endpoint)}${path}`;
}

async function parseJson<T>(response: OllamaTextResponse): Promise<T> {
  return JSON.parse(await response.text()) as T;
}

async function supportsCompletionCapability(
  endpoint: string,
  model: string,
  fetchImpl: OllamaFetch
): Promise<boolean> {
  try {
    const response = await fetchImpl(buildOllamaUrl(endpoint, '/api/show'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return true;
    }

    const data = await parseJson<OllamaShowResponse>(response);

    if (!Array.isArray(data.capabilities) || data.capabilities.length === 0) {
      return true;
    }

    return data.capabilities.includes('completion');
  } catch {
    return true;
  }
}

function isLikelyEmbeddingOnlyModel(model: OllamaTagModel): boolean {
  const values = [
    model.name,
    model.details?.family,
    ...(model.details?.families || []),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return values.some((value) => value.includes('embed') || value.includes('bert'));
}

export async function fetchAvailableCompletionModels(
  endpoint: string,
  fetchImpl: OllamaFetch = fetch
): Promise<string[]> {
  const response = await fetchImpl(buildOllamaUrl(endpoint, '/api/tags'), {
    method: 'GET',
    signal: AbortSignal.timeout(3000),
  });

  if (!response.ok) {
    return [];
  }

  const data = await parseJson<OllamaTagsResponse>(response);
  const tagModels = (data.models || []).filter((model): model is OllamaTagModel => Boolean(model?.name));
  const obviousCompletionModels = tagModels.filter(
    (model) => !isLikelyEmbeddingOnlyModel(model)
  );

  if (obviousCompletionModels.length !== tagModels.length) {
    return obviousCompletionModels.map((model) => model.name);
  }

  const modelNames = tagModels.map((model) => model.name);

  const capabilityChecks = await Promise.all(
    modelNames.map((model) => supportsCompletionCapability(endpoint, model, fetchImpl))
  );

  return modelNames.filter((_, index) => capabilityChecks[index]);
}

export async function readOllamaErrorMessage(
  response: Pick<OllamaTextResponse, 'status' | 'statusText' | 'text'>
): Promise<string> {
  try {
    const body = (await response.text()).trim();

    if (!body) {
      return response.statusText || `HTTP ${response.status}`;
    }

    const data = JSON.parse(body) as { error?: string };
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim();
    }

    return body;
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}
