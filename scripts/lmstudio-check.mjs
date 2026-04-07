import { buildLmStudioDevCheckMessage } from "./lmstudio-check-lib.mjs";

const DEFAULT_BASE_URL = "http://localhost:1234/v1";

async function fetchLmStudioModels(baseUrl) {
  const normalizedBaseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const requestTarget = `${normalizedBaseUrl}/models`;

  try {
    const response = await fetch(requestTarget, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        baseUrl: normalizedBaseUrl,
        modelIds: [],
        message: `LM Studio responded with ${response.status} from ${requestTarget}.`,
      };
    }

    const payload = await response.json();
    const modelIds = Array.isArray(payload?.data)
      ? payload.data
          .map((entry) => (entry && typeof entry.id === "string" ? entry.id : null))
          .filter(Boolean)
      : [];

    if (modelIds.length === 0 && !Array.isArray(payload?.data)) {
      return {
        ok: false,
        baseUrl: normalizedBaseUrl,
        modelIds: [],
        message: `LM Studio returned an invalid response from ${requestTarget}.`,
      };
    }

    return {
      ok: true,
      baseUrl: normalizedBaseUrl,
      modelIds,
      message: `Connected to LM Studio at ${requestTarget}.`,
    };
  } catch (_error) {
    return {
      ok: false,
      baseUrl: normalizedBaseUrl,
      modelIds: [],
      message: `LM Studio is unreachable at ${requestTarget}.`,
    };
  }
}

async function main() {
  const baseUrl = process.env.LMSTUDIO_BASE_URL || DEFAULT_BASE_URL;

  // We intentionally do not try to launch LM Studio here because desktop app startup,
  // model loading, and local server lifecycle are OS-specific and brittle for npm scripts.
  const result = await fetchLmStudioModels(baseUrl);
  const message = buildLmStudioDevCheckMessage(result);

  if (result.ok) {
    console.log(message);
    return;
  }

  console.warn(message);
  process.exitCode = 1;
}

main();
