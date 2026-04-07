export interface EmbeddingConfigSnapshot {
  provider: string;
  model: string;
  baseUrl: string | null;
  vectorDimensions: number;
  schemaDimensions: number;
}

export interface EmbeddingReindexState {
  required: boolean;
  status: "aligned" | "required" | "queued" | "processing" | "failed";
  activeFingerprint: string;
  selectedFingerprint: string;
  lastIndexedFingerprint: string | null;
  lastIndexedAt: string | null;
  activeGenerationId: string | null;
  selectedGenerationId: string | null;
  pendingGenerationId: string | null;
  pendingJobId: string | null;
  pendingJobStatus: "pending" | "processing" | "failed" | "completed" | null;
  activationPending: boolean;
  totalDocuments?: number | null;
  processedDocuments?: number | null;
  remainingDocuments?: number | null;
  progressPercent?: number | null;
  progressStatus?: "queued" | "processing" | "activating" | "completed" | "failed";
  progressLabel?: string;
  lastError?: string | null;
  message: string | null;
}

function normalizeFingerprintPart(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim().toLowerCase();
}

export function buildEmbeddingConfigFingerprint(config: EmbeddingConfigSnapshot) {
  return [
    normalizeFingerprintPart(config.provider),
    normalizeFingerprintPart(config.model),
    normalizeFingerprintPart(config.baseUrl),
    normalizeFingerprintPart(config.vectorDimensions),
    normalizeFingerprintPart(config.schemaDimensions),
  ].join("|");
}

export function embeddingConfigChangeRequiresReindex(
  previous: EmbeddingConfigSnapshot,
  next: EmbeddingConfigSnapshot,
) {
  return buildEmbeddingConfigFingerprint(previous) !== buildEmbeddingConfigFingerprint(next);
}

export function buildEmbeddingReindexState(input: {
  activeConfig?: EmbeddingConfigSnapshot | null;
  selectedConfig?: EmbeddingConfigSnapshot | null;
  status?: string | null;
  activeFingerprint?: string | null;
  selectedFingerprint?: string | null;
  required?: boolean | null;
  lastIndexedFingerprint?: string | null;
  lastIndexedAt?: string | null;
  activeGenerationId?: string | null;
  selectedGenerationId?: string | null;
  pendingGenerationId?: string | null;
  pendingJobId?: string | null;
  pendingJobStatus?: string | null;
  totalDocuments?: number | null;
  processedDocuments?: number | null;
  remainingDocuments?: number | null;
  progressPercent?: number | null;
  lastError?: string | null;
  message?: string | null;
}) : EmbeddingReindexState {
  const selectedConfig = input.selectedConfig || input.activeConfig;
  const activeConfig = input.activeConfig || input.selectedConfig;

  if (!selectedConfig || !activeConfig) {
    throw new Error("An active or selected embedding config is required.");
  }

  const activeFingerprint = input.activeFingerprint || buildEmbeddingConfigFingerprint(activeConfig);
  const selectedFingerprint = input.selectedFingerprint || buildEmbeddingConfigFingerprint(selectedConfig);
  const pendingJobStatus = input.pendingJobStatus === "pending"
    || input.pendingJobStatus === "processing"
    || input.pendingJobStatus === "failed"
    || input.pendingJobStatus === "completed"
    ? input.pendingJobStatus
    : null;
  const activationPending = selectedFingerprint !== activeFingerprint;
  const required = Boolean(input.required) || activationPending;
  const totalDocuments = typeof input.totalDocuments === "number" && Number.isFinite(input.totalDocuments)
    ? Math.max(0, Math.trunc(input.totalDocuments))
    : null;
  const remainingDocuments = typeof input.remainingDocuments === "number" && Number.isFinite(input.remainingDocuments)
    ? Math.max(0, Math.trunc(input.remainingDocuments))
    : null;
  const processedDocuments = typeof input.processedDocuments === "number" && Number.isFinite(input.processedDocuments)
    ? Math.max(0, Math.trunc(input.processedDocuments))
    : totalDocuments !== null && remainingDocuments !== null
      ? Math.max(0, totalDocuments - remainingDocuments)
      : null;
  const explicitFailed = input.status === "failed" || pendingJobStatus === "failed";
  const status = explicitFailed
    ? "failed"
    : pendingJobStatus === "processing"
    ? "processing"
    : pendingJobStatus === "pending"
      ? "queued"
      : required
        ? "required"
        : "aligned";
  const progressPercent = typeof input.progressPercent === "number" && Number.isFinite(input.progressPercent)
    ? Math.max(0, Math.min(100, Math.trunc(input.progressPercent)))
    : totalDocuments !== null && processedDocuments !== null
      ? Math.max(0, Math.min(100, Math.round((processedDocuments / Math.max(totalDocuments, 1)) * 100)))
      : explicitFailed
        ? 0
        : !required
          ? 100
          : pendingJobStatus === "pending"
            ? 0
            : null;
  const progressStatus = explicitFailed
    ? "failed"
    : pendingJobStatus === "pending"
      ? "queued"
      : activationPending && progressPercent === 100
        ? "activating"
        : required
          ? "processing"
          : "completed";
  const progressLabel = progressStatus === "failed"
    ? "Failed"
    : progressStatus === "queued"
      ? "Queued"
      : progressStatus === "activating"
        ? "Activating new retrieval generation"
        : progressStatus === "completed"
          ? "Completed"
          : "Rebuilding embeddings";
  const message = input.message !== undefined
    ? input.message
    : activationPending
      ? "Search embeddings are rebuilding. Retrieval stays on the active indexed generation until activation completes."
      : required
        ? "Search embeddings need to be rebuilt for the active embedding configuration."
        : null;

  return {
    required,
    status,
    activeFingerprint,
    selectedFingerprint,
    lastIndexedFingerprint: input.lastIndexedFingerprint || activeFingerprint,
    lastIndexedAt: input.lastIndexedAt || null,
    activeGenerationId: input.activeGenerationId || null,
    selectedGenerationId: input.selectedGenerationId || null,
    pendingGenerationId: input.pendingGenerationId || null,
    pendingJobId: input.pendingJobId || null,
    pendingJobStatus,
    activationPending,
    totalDocuments,
    processedDocuments,
    remainingDocuments,
    progressPercent,
    progressStatus,
    progressLabel,
    lastError: input.lastError || null,
    message,
  };
}
