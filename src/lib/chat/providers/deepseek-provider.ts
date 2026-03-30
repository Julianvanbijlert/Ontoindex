import { DEFAULT_DEEPSEEK_BASE_URL } from "../../ai/provider-factory.ts";
import { DEFAULT_LLM_MODEL } from "../provider-config.ts";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider.ts";

function supportsDeepSeekToolCalls(model: string) {
  return model.trim().toLowerCase() !== "deepseek-reasoner";
}

export class DeepSeekProvider extends OpenAiCompatibleProvider {
  constructor(options: { model?: string; apiKey: string; baseUrl?: string | null }) {
    const model = options.model?.trim() || DEFAULT_LLM_MODEL;

    super({
      name: "deepseek",
      family: "deepseek",
      model,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl || DEFAULT_DEEPSEEK_BASE_URL,
      capabilities: {
        supportsToolCalls: supportsDeepSeekToolCalls(model),
      },
    });
  }
}
