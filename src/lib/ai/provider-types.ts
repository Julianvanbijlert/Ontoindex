export type EmbeddingProvider =
  | "gemini"
  | "deepseek"
  | "huggingface"
  | "local"
  | "lmstudio";

export type ChatProvider =
  | "deepseek"
  | "gemini"
  | "mock"
  | "openai"
  | "openai-compatible"
  | "anthropic"
  | "lmstudio";

export interface ProviderSecretStatus {
  configured: boolean;
  masked: string | null;
  updatedAt: string | null;
}
