import { OpenAiCompatibleProvider } from "./openai-compatible-provider.ts";

export class OpenAiProvider extends OpenAiCompatibleProvider {
  constructor(options: { model: string; apiKey: string; baseUrl?: string | null }) {
    super({
      name: "openai",
      family: "openai",
      model: options.model,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl || "https://api.openai.com/v1",
    });
  }
}
