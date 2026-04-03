import { describe, expect, it, vi } from "vitest";

import {
  createDefaultStandardsSettings,
  fetchAdminStandardsSettings,
  fetchStandardsRuntimeSettings,
  parseStandardsSettings,
  updateAdminStandardsSettings,
} from "@/lib/standards/settings-service";

describe("standards-settings-service", () => {
  it("returns the shipped defaults when the payload is missing or malformed", () => {
    expect(parseStandardsSettings(null)).toEqual(createDefaultStandardsSettings());
    expect(parseStandardsSettings("invalid" as never)).toEqual(createDefaultStandardsSettings());
  });

  it("preserves an explicit empty enabled standards array", () => {
    const settings = parseStandardsSettings({
      enabledStandards: [],
      ruleOverrides: {},
    } as never);

    expect(settings.enabledStandards).toEqual([]);
  });

  it("merges partial stored settings with shipped defaults", () => {
    const defaults = createDefaultStandardsSettings();
    const settings = parseStandardsSettings({
      enabledStandards: ["rdf"],
      ruleOverrides: {
        rdf_invalid_subject_iri: "blocking",
      },
    } as never);

    expect(settings.enabledStandards).toEqual(["rdf"]);
    expect(settings.ruleOverrides.rdf_invalid_subject_iri).toBe("blocking");
    expect(settings.ruleOverrides.mim_missing_class_label).toBe(defaults.ruleOverrides.mim_missing_class_label);
    expect(settings.ruleOverrides.nl_sbb_unknown_relation_target).toBe(defaults.ruleOverrides.nl_sbb_unknown_relation_target);
  });

  it("applies shipped rule defaults to rules that are not explicitly overridden", () => {
    const defaults = createDefaultStandardsSettings();
    const settings = parseStandardsSettings({
      ruleOverrides: {
        mim_missing_class_label: "blocking",
      },
    } as never);

    expect(settings.ruleOverrides.mim_missing_class_label).toBe("blocking");
    expect(settings.ruleOverrides.rdf_invalid_blank_node).toBe(defaults.ruleOverrides.rdf_invalid_blank_node);
    expect(settings.ruleOverrides.nl_sbb_unmapped_relation_semantics).toBe(
      defaults.ruleOverrides.nl_sbb_unmapped_relation_semantics,
    );
  });

  it("loads runtime settings from the standards rpc", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          enabledStandards: ["mim"],
          ruleOverrides: {
            mim_missing_class_label: "warning",
          },
        },
        error: null,
      }),
    } as any;

    const settings = await fetchStandardsRuntimeSettings(client);

    expect(client.rpc).toHaveBeenCalledWith("get_standards_runtime_settings");
    expect(settings.enabledStandards).toEqual(["mim"]);
    expect(settings.ruleOverrides.mim_missing_class_label).toEqual("warning");
    expect(settings.ruleOverrides.rdf_invalid_subject_iri).toBeDefined();
  });

  it("loads admin settings from the admin standards rpc", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          enabledStandards: ["mim", "nl-sbb"],
          ruleOverrides: {},
        },
        error: null,
      }),
    } as any;

    const settings = await fetchAdminStandardsSettings(client);

    expect(client.rpc).toHaveBeenCalledWith("get_admin_standards_settings");
    expect(settings.enabledStandards).toEqual(["mim", "nl-sbb"]);
  });

  it("saves admin settings through the admin standards rpc", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          enabledStandards: ["mim", "rdf"],
          ruleOverrides: {
            rdf_invalid_subject_iri: "blocking",
          },
        },
        error: null,
      }),
    } as any;

    const settings = await updateAdminStandardsSettings(client, {
      enabledStandards: ["mim", "rdf"],
      ruleOverrides: {
        rdf_invalid_subject_iri: "blocking",
      },
    });

    expect(client.rpc).toHaveBeenCalledWith("update_admin_standards_settings", {
      _settings: expect.objectContaining({
        enabledStandards: ["mim", "rdf"],
        ruleOverrides: expect.objectContaining({
          rdf_invalid_subject_iri: "blocking",
        }),
      }),
    });
    expect(settings.ruleOverrides.rdf_invalid_subject_iri).toBe("blocking");
  });

  it("falls back to table persistence without mutating unrelated settings", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 1,
        standards_settings: {
          enabledStandards: [],
          ruleOverrides: {
            rdf_invalid_subject_iri: "blocking",
          },
        },
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({
      select,
      upsert,
    }));
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "42883",
          message: "could not find the function",
        },
      }),
      from,
    } as any;

    await updateAdminStandardsSettings(client, {
      enabledStandards: [],
      ruleOverrides: {
        rdf_invalid_subject_iri: "blocking",
      },
    });

    expect(upsert).toHaveBeenCalledWith({
      id: 1,
      standards_settings: expect.objectContaining({
        enabledStandards: [],
      }),
    }, { onConflict: "id" });
    expect(upsert.mock.calls[0][0]).not.toHaveProperty("allow_self_role_change");
  });
});
