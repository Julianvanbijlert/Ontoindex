function readBooleanFlag(value: string | undefined, fallback: boolean) {
  if (value == null || value === "") {
    return fallback;
  }

  return value === "1" || value.toLowerCase() === "true";
}

function readNumberFlag(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const chatRuntimeConfig = {
  enableSimilarityExpansion: readBooleanFlag(
    import.meta.env.VITE_CHAT_ENABLE_SIMILARITY_EXPANSION,
    true,
  ),
  strictCitationsDefault: readBooleanFlag(
    import.meta.env.VITE_CHAT_STRICT_CITATIONS_DEFAULT,
    true,
  ),
  historyMessageLimit: readNumberFlag(
    import.meta.env.VITE_CHAT_HISTORY_LIMIT,
    12,
  ),
  maxEvidenceItems: readNumberFlag(
    import.meta.env.VITE_CHAT_MAX_EVIDENCE_ITEMS,
    6,
  ),
  answerTemperature: readNumberFlag(
    import.meta.env.VITE_CHAT_TEMPERATURE,
    0.2,
  ),
  maxAnswerTokens: readNumberFlag(
    import.meta.env.VITE_CHAT_MAX_TOKENS,
    700,
  ),
};
