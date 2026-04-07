export function buildLmStudioDevCheckMessage(result) {
  if (result.ok) {
    return `LM Studio check succeeded for ${result.baseUrl}. Found ${result.modelIds.length} model(s).`;
  }

  return [
    `LM Studio check failed for ${result.baseUrl}.`,
    result.message,
    "Start LM Studio, enable the OpenAI-compatible local server, and verify the configured /v1 base URL before retrying.",
  ].join(" ");
}
