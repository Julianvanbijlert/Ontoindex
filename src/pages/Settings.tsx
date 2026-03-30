import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAdminChatSettings,
  updateAdminChatSettings,
} from "@/lib/chat-admin-settings-service";
import {
  defaultLlmBaseUrlForProvider,
  defaultLlmModelForProvider,
} from "@/lib/chat/provider-config";
import { defaultEmbeddingBaseUrlForProvider } from "@/lib/ai/provider-factory";
import type { AdminChatSettings } from "@/lib/chat/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { canManageUsers } from "@/lib/authorization";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

function parseNumericInput(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function Settings() {
  const { profile, refreshProfile, role } = useAuth();
  const [saving, setSaving] = useState(false);
  const [chatSettings, setChatSettings] = useState<AdminChatSettings | null>(null);
  const [chatSettingsLoading, setChatSettingsLoading] = useState(false);
  const [chatSettingsSaving, setChatSettingsSaving] = useState(false);
  const [chatSettingsError, setChatSettingsError] = useState<string | null>(null);
  const [deepseekApiKeyDraft, setDeepseekApiKeyDraft] = useState("");
  const [geminiApiKeyDraft, setGeminiApiKeyDraft] = useState("");
  const [huggingFaceApiKeyDraft, setHuggingFaceApiKeyDraft] = useState("");
  const [form, setForm] = useState({
    dark_mode: profile?.dark_mode || false,
    view_preference: profile?.view_preference || "medium",
    format_preference: profile?.format_preference || "grid",
    sort_preference: profile?.sort_preference || "asc",
    group_by_preference: profile?.group_by_preference || "name",
  });
  const canManageChatSettings = canManageUsers(role);

  useEffect(() => {
    if (!canManageChatSettings) {
      setChatSettings(null);
      setChatSettingsError(null);
      return;
    }

    let active = true;
    setChatSettingsLoading(true);
    fetchAdminChatSettings(supabase)
      .then((settings) => {
        if (active) {
          setChatSettings(settings);
          setChatSettingsError(null);
        }
      })
      .catch((error) => {
        if (active) {
          const message = error instanceof Error ? error.message : "Unable to load admin AI settings.";
          setChatSettingsError(message);
          toast.error(message);
        }
      })
      .finally(() => {
        if (active) {
          setChatSettingsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canManageChatSettings]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update(form).eq("user_id", profile.user_id);
    if (error) toast.error(error.message);
    else { toast.success("Settings saved"); await refreshProfile(); }
    setSaving(false);
  };

  const handleSaveChatSettings = async () => {
    if (!chatSettings) {
      return;
    }

    setChatSettingsSaving(true);
    try {
      const updated = await updateAdminChatSettings(supabase, {
        provider: {
          llmProvider: chatSettings.provider.llmProvider,
          llmModel: chatSettings.provider.llmModel,
          llmBaseUrl: chatSettings.provider.llmBaseUrl,
          llmTemperature: chatSettings.provider.llmTemperature,
          llmMaxTokens: chatSettings.provider.llmMaxTokens,
        },
        embeddings: {
          embeddingProvider: chatSettings.embeddings.embeddingProvider,
          embeddingModel: chatSettings.embeddings.embeddingModel,
          embeddingBaseUrl: chatSettings.embeddings.embeddingBaseUrl,
          fallbackProvider: chatSettings.embeddings.fallbackProvider,
          fallbackModel: chatSettings.embeddings.fallbackModel,
          fallbackBaseUrl: chatSettings.embeddings.fallbackBaseUrl,
          vectorDimensions: chatSettings.embeddings.vectorDimensions,
        },
        runtime: {
          enableSimilarityExpansion: chatSettings.runtime.enableSimilarityExpansion,
          strictCitationsDefault: chatSettings.runtime.strictCitationsDefault,
          historyLimit: chatSettings.runtime.historyLimit,
          maxEvidenceItems: chatSettings.runtime.maxEvidenceItems,
          temperature: chatSettings.runtime.temperature,
          maxTokens: chatSettings.runtime.maxTokens,
        },
        providerKeys: {
          deepseekApiKey: deepseekApiKeyDraft.trim() || null,
          geminiApiKey: geminiApiKeyDraft.trim() || null,
          huggingFaceApiKey: huggingFaceApiKeyDraft.trim() || null,
        },
        apiKey: chatSettings.provider.llmProvider === "deepseek"
          ? (deepseekApiKeyDraft.trim() || null)
          : chatSettings.provider.llmProvider === "gemini"
            ? (geminiApiKeyDraft.trim() || null)
            : null,
      });
      setChatSettings(updated);
      setDeepseekApiKeyDraft("");
      setGeminiApiKeyDraft("");
      setHuggingFaceApiKeyDraft("");
      setChatSettingsError(null);
      toast.success("AI settings saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save AI settings.";
      setChatSettingsError(message);
      toast.error(message);
    } finally {
      setChatSettingsSaving(false);
    }
  };

  const handleClearProviderKey = async (provider: "deepseek" | "gemini" | "huggingface") => {
    if (!chatSettings) {
      return;
    }

    setChatSettingsSaving(true);
    try {
      const updated = await updateAdminChatSettings(supabase, {
        provider: {
          llmProvider: chatSettings.provider.llmProvider,
          llmModel: chatSettings.provider.llmModel,
          llmBaseUrl: chatSettings.provider.llmBaseUrl,
          llmTemperature: chatSettings.provider.llmTemperature,
          llmMaxTokens: chatSettings.provider.llmMaxTokens,
        },
        embeddings: {
          embeddingProvider: chatSettings.embeddings.embeddingProvider,
          embeddingModel: chatSettings.embeddings.embeddingModel,
          embeddingBaseUrl: chatSettings.embeddings.embeddingBaseUrl,
          fallbackProvider: chatSettings.embeddings.fallbackProvider,
          fallbackModel: chatSettings.embeddings.fallbackModel,
          fallbackBaseUrl: chatSettings.embeddings.fallbackBaseUrl,
          vectorDimensions: chatSettings.embeddings.vectorDimensions,
        },
        runtime: {
          enableSimilarityExpansion: chatSettings.runtime.enableSimilarityExpansion,
          strictCitationsDefault: chatSettings.runtime.strictCitationsDefault,
          historyLimit: chatSettings.runtime.historyLimit,
          maxEvidenceItems: chatSettings.runtime.maxEvidenceItems,
          temperature: chatSettings.runtime.temperature,
          maxTokens: chatSettings.runtime.maxTokens,
        },
        clearApiKey: provider === chatSettings.provider.llmProvider,
        providerKeys: {
          clearDeepseekApiKey: provider === "deepseek",
          clearGeminiApiKey: provider === "gemini",
          clearHuggingFaceApiKey: provider === "huggingface",
        },
      });
      setChatSettings(updated);
      setDeepseekApiKeyDraft("");
      setGeminiApiKeyDraft("");
      setHuggingFaceApiKeyDraft("");
      setChatSettingsError(null);
      toast.success(`${provider} API key cleared`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to clear the provider API key.";
      setChatSettingsError(message);
      toast.error(message);
    } finally {
      setChatSettingsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Dark Mode</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Toggle dark theme</p>
            </div>
            <Switch checked={form.dark_mode} onCheckedChange={v => setForm(p => ({...p, dark_mode: v}))} />
          </div>

          <div className="space-y-2">
            <Label>View Size</Label>
            <Select value={form.view_preference} onValueChange={v => setForm(p => ({...p, view_preference: v}))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Display Format</Label>
            <Select value={form.format_preference} onValueChange={v => setForm(p => ({...p, format_preference: v}))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="grid">Grid</SelectItem>
                <SelectItem value="table">Table</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sort Order</Label>
            <Select value={form.sort_preference} onValueChange={v => setForm(p => ({...p, sort_preference: v}))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Group By</Label>
            <Select value={form.group_by_preference} onValueChange={v => setForm(p => ({...p, group_by_preference: v}))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="date">Date Modified</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      {canManageChatSettings && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Admin AI Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {chatSettingsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading admin AI settings...
              </div>
            ) : chatSettings ? (
              <>
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Chat Generation</h3>
                  <p className="text-xs text-muted-foreground">
                    Configure the primary chat provider. Gemini is the default because it is the most reliable provider in this environment, and chat falls back to another configured provider when available.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>LLM Provider</Label>
                  <Select
                    value={chatSettings.provider.llmProvider}
                    onValueChange={(value) => setChatSettings((current) => current ? ({
                      ...current,
                      provider: {
                        ...current.provider,
                        llmProvider: value,
                        llmModel: defaultLlmModelForProvider(value, current.provider.llmModel),
                        llmBaseUrl: defaultLlmBaseUrlForProvider(value),
                      },
                    }) : current)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Gemini</SelectItem>
                      <SelectItem value="deepseek">DeepSeek</SelectItem>
                      <SelectItem value="mock">Mock</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="openai-compatible">OpenAI-Compatible</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>LLM Model</Label>
                  <Input
                    value={chatSettings.provider.llmModel}
                    placeholder={
                      chatSettings.provider.llmProvider === "deepseek"
                        ? "deepseek-chat or deepseek-reasoner"
                        : chatSettings.provider.llmProvider === "gemini"
                          ? "gemini-2.0-flash"
                          : undefined
                    }
                    onChange={(event) => setChatSettings((current) => current ? ({
                      ...current,
                      provider: {
                        ...current.provider,
                        llmModel: event.target.value,
                      },
                    }) : current)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>LLM Base URL</Label>
                  <Input
                    value={chatSettings.provider.llmBaseUrl || ""}
                    placeholder="Optional provider base URL"
                    onChange={(event) => setChatSettings((current) => current ? ({
                      ...current,
                      provider: {
                        ...current.provider,
                        llmBaseUrl: event.target.value || null,
                      },
                    }) : current)}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Provider Temperature</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={chatSettings.provider.llmTemperature}
                      onChange={(event) => setChatSettings((current) => current ? ({
                        ...current,
                        provider: {
                          ...current.provider,
                          llmTemperature: parseNumericInput(event.target.value, current.provider.llmTemperature),
                        },
                      }) : current)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Provider Max Tokens</Label>
                    <Input
                      type="number"
                      min="1"
                      value={chatSettings.provider.llmMaxTokens}
                      onChange={(event) => setChatSettings((current) => current ? ({
                        ...current,
                        provider: {
                          ...current.provider,
                          llmMaxTokens: parseNumericInput(event.target.value, current.provider.llmMaxTokens),
                        },
                      }) : current)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Provider API Keys</Label>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        DeepSeek: {chatSettings.providerKeys.deepseek.configured ? "Configured" : "Not configured"}
                      </p>
                      <Input
                        type="password"
                        value={deepseekApiKeyDraft}
                        placeholder="Set DeepSeek key"
                        onChange={(event) => setDeepseekApiKeyDraft(event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleClearProviderKey("deepseek")}
                        disabled={chatSettingsSaving || !chatSettings.providerKeys.deepseek.configured}
                      >
                        Clear DeepSeek Key
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Gemini: {chatSettings.providerKeys.gemini.configured ? "Configured" : "Not configured"}
                      </p>
                      <Input
                        type="password"
                        value={geminiApiKeyDraft}
                        placeholder="Set Gemini key"
                        onChange={(event) => setGeminiApiKeyDraft(event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleClearProviderKey("gemini")}
                        disabled={chatSettingsSaving || !chatSettings.providerKeys.gemini.configured}
                      >
                        Clear Gemini Key
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        HuggingFace: {chatSettings.providerKeys.huggingface.configured ? "Configured" : "Not configured"}
                      </p>
                      <Input
                        type="password"
                        value={huggingFaceApiKeyDraft}
                        placeholder="Set HuggingFace key"
                        onChange={(event) => setHuggingFaceApiKeyDraft(event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleClearProviderKey("huggingface")}
                        disabled={chatSettingsSaving || !chatSettings.providerKeys.huggingface.configured}
                      >
                        Clear HuggingFace Key
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1 border-t border-border/50 pt-4">
                  <h3 className="text-sm font-medium">Embeddings</h3>
                  <p className="text-xs text-muted-foreground">
                    Configure semantic search embeddings separately from chat generation. Gemini is the default primary provider and HuggingFace is the default fallback.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Embedding Provider</Label>
                    <Select
                      value={chatSettings.embeddings.embeddingProvider}
                      onValueChange={(value) => setChatSettings((current) => current ? ({
                        ...current,
                        embeddings: {
                          ...current.embeddings,
                          embeddingProvider: value,
                          embeddingModel: current.embeddings.embeddingModel || "",
                          embeddingBaseUrl: defaultEmbeddingBaseUrlForProvider(value) || current.embeddings.embeddingBaseUrl,
                        },
                      }) : current)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini">Gemini</SelectItem>
                        <SelectItem value="deepseek">DeepSeek</SelectItem>
                        <SelectItem value="huggingface">HuggingFace</SelectItem>
                        <SelectItem value="local">Local</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Embedding Model</Label>
                    <Input
                      value={chatSettings.embeddings.embeddingModel}
                      placeholder="gemini-embedding-001"
                      onChange={(event) => setChatSettings((current) => current ? ({
                        ...current,
                        embeddings: {
                          ...current.embeddings,
                          embeddingModel: event.target.value,
                        },
                      }) : current)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Embedding Base URL</Label>
                    <Input
                      value={chatSettings.embeddings.embeddingBaseUrl || ""}
                      placeholder="Provider base URL"
                      onChange={(event) => setChatSettings((current) => current ? ({
                        ...current,
                        embeddings: {
                          ...current.embeddings,
                          embeddingBaseUrl: event.target.value || null,
                        },
                      }) : current)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Vector Dimensions</Label>
                    <Input
                      type="number"
                      min="1"
                      value={chatSettings.embeddings.vectorDimensions}
                      onChange={(event) => setChatSettings((current) => current ? ({
                        ...current,
                        embeddings: {
                          ...current.embeddings,
                          vectorDimensions: parseNumericInput(event.target.value, current.embeddings.vectorDimensions),
                        },
                      }) : current)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Fallback Provider</Label>
                    <Select
                      value={chatSettings.embeddings.fallbackProvider || "huggingface"}
                      onValueChange={(value) => setChatSettings((current) => current ? ({
                        ...current,
                        embeddings: {
                          ...current.embeddings,
                          fallbackProvider: value,
                        },
                      }) : current)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="huggingface">HuggingFace</SelectItem>
                        <SelectItem value="gemini">Gemini</SelectItem>
                        <SelectItem value="deepseek">DeepSeek</SelectItem>
                        <SelectItem value="local">Local</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Fallback Model</Label>
                    <Input
                      value={chatSettings.embeddings.fallbackModel || ""}
                      placeholder="sentence-transformers/all-MiniLM-L6-v2"
                      onChange={(event) => setChatSettings((current) => current ? ({
                        ...current,
                        embeddings: {
                          ...current.embeddings,
                          fallbackModel: event.target.value || null,
                        },
                      }) : current)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fallback Base URL</Label>
                    <Input
                      value={chatSettings.embeddings.fallbackBaseUrl || ""}
                      placeholder="Fallback provider base URL"
                      onChange={(event) => setChatSettings((current) => current ? ({
                        ...current,
                        embeddings: {
                          ...current.embeddings,
                          fallbackBaseUrl: event.target.value || null,
                        },
                      }) : current)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm">
                    <span>Default similarity expansion</span>
                    <Switch
                      checked={chatSettings.runtime.enableSimilarityExpansion}
                      onCheckedChange={(value) => setChatSettings((current) => current ? ({
                        ...current,
                        runtime: {
                          ...current.runtime,
                          enableSimilarityExpansion: value,
                        },
                      }) : current)}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm">
                    <span>Default strict citations</span>
                    <Switch
                      checked={chatSettings.runtime.strictCitationsDefault}
                      onCheckedChange={(value) => setChatSettings((current) => current ? ({
                        ...current,
                        runtime: {
                          ...current.runtime,
                          strictCitationsDefault: value,
                        },
                      }) : current)}
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>History Limit</Label>
                    <Input
                      type="number"
                      min="1"
                      value={chatSettings.runtime.historyLimit}
                      onChange={(event) => setChatSettings((current) => current ? ({
                        ...current,
                        runtime: {
                          ...current.runtime,
                          historyLimit: parseNumericInput(event.target.value, current.runtime.historyLimit),
                        },
                      }) : current)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Evidence Items</Label>
                    <Input
                      type="number"
                      min="1"
                      value={chatSettings.runtime.maxEvidenceItems}
                      onChange={(event) => setChatSettings((current) => current ? ({
                        ...current,
                        runtime: {
                          ...current.runtime,
                          maxEvidenceItems: parseNumericInput(event.target.value, current.runtime.maxEvidenceItems),
                        },
                      }) : current)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Runtime Temperature</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={chatSettings.runtime.temperature}
                      onChange={(event) => setChatSettings((current) => current ? ({
                        ...current,
                        runtime: {
                          ...current.runtime,
                          temperature: parseNumericInput(event.target.value, current.runtime.temperature),
                        },
                      }) : current)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Runtime Max Tokens</Label>
                    <Input
                      type="number"
                      min="1"
                      value={chatSettings.runtime.maxTokens}
                      onChange={(event) => setChatSettings((current) => current ? ({
                        ...current,
                        runtime: {
                          ...current.runtime,
                          maxTokens: parseNumericInput(event.target.value, current.runtime.maxTokens),
                        },
                      }) : current)}
                    />
                  </div>
                </div>

                {chatSettingsError && (
                  <p className="text-sm text-destructive">{chatSettingsError}</p>
                )}

                <Button onClick={handleSaveChatSettings} disabled={chatSettingsSaving}>
                  {chatSettingsSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save AI Settings
                </Button>
              </>
            ) : (
                  <p className="text-sm text-destructive">{chatSettingsError || "Unable to load admin AI settings."}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
