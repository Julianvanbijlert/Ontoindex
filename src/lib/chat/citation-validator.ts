import type {
  ChatEvidenceItem,
  CitationValidationResult,
  GroundedAnswerPayload,
} from "./types.ts";

const citationPattern = /\[(E\d+)\]/g;

export function extractCitationIds(text: string) {
  return Array.from(text.matchAll(citationPattern)).map((match) => match[1]);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function validateGroundedAnswer(
  payload: GroundedAnswerPayload,
  evidencePack: ChatEvidenceItem[],
  strictCitations: boolean,
): CitationValidationResult {
  const evidenceIds = new Set(
    evidencePack
      .filter((item) => !item.safety.isDeleted && !item.safety.tombstoneDetected)
      .map((item) => item.citationId),
  );
  const rawCitations = unique([
    ...(payload.citations || []),
    ...extractCitationIds(payload.answer || ""),
  ]);
  const validCitations = rawCitations.filter((citationId) => evidenceIds.has(citationId));
  const invalidCitations = rawCitations.filter((citationId) => !evidenceIds.has(citationId));

  const sanitizedText = invalidCitations.reduce(
    (current, citationId) => current.replaceAll(`[${citationId}]`, "").replace(/\s{2,}/g, " ").trim(),
    payload.answer || "",
  );
  const grounded = validCitations.length > 0;

  if (strictCitations && sanitizedText && !grounded) {
    return {
      text: "",
      validCitations,
      invalidCitations,
      grounded: false,
      fallbackText: "I couldn't ground a confident answer from the currently retrieved evidence.",
    };
  }

  return {
    text: sanitizedText,
    validCitations,
    invalidCitations,
    grounded,
    fallbackText: null,
  };
}
