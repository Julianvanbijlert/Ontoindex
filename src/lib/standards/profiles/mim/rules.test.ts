import { describe, expect, it } from "vitest";

import { runStandardsValidation } from "@/lib/standards/engine/run-validation";
import { createStandardsModel } from "@/lib/standards/model";
import { mimStandardsPack } from "@/lib/standards/profiles/mim/rules";
import { validateStandardsModel } from "@/lib/standards/validation";

describe("mim standards catalog", () => {
  describe("required family", () => {
    it("defines starter metadata for identifier discipline", () => {
      const rule = mimStandardsPack.rules.find((item) => item.ruleId === "mim_identifier_required");

      expect(rule).toMatchObject({
        ruleId: "mim_identifier_required",
        title: expect.stringMatching(/identifier/i),
        category: "required",
        scope: "class",
        defaultSeverity: "warning",
        implementationStatus: "starter",
        requiresGlobalContext: false,
        rationale: expect.stringMatching(/traceable|identifier/i),
      });
    });

    it("warns when a modeled class has no identifier yet", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["mim"],
          classes: [
            {
              id: "class-policy",
              label: "Policy",
            },
          ],
        }),
        packs: [mimStandardsPack],
        settings: {
          enabledStandards: ["mim"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            standardId: "mim",
            ruleId: "mim_identifier_required",
            effectiveSeverity: "warning",
            path: "classes[class-policy].identifiers",
            explanation: expect.stringMatching(/identifier/i),
          }),
        ]),
      );
    });

    it("warns when an attribute is missing a datatype reference in the starter catalog", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["mim"],
          classes: [
            {
              id: "class-policy",
              label: "Policy",
              identifiers: [{ id: "identifier-policy", name: "policyId" }],
              attributes: [
                {
                  id: "attribute-name",
                  name: "name",
                },
              ],
            },
          ],
        }),
        packs: [mimStandardsPack],
        settings: {
          enabledStandards: ["mim"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "mim_attribute_datatype_recommended",
            path: "classes[class-policy].attributes[attribute-name].datatypeId",
            effectiveSeverity: "warning",
          }),
        ]),
      );
    });
  });

  describe("consistency family", () => {
    it("detects duplicate identifier ids and duplicate class labels inside one package scope", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["mim"],
          packages: [
            { id: "pkg-core", label: "Core" },
          ],
          classes: [
            {
              id: "class-policy",
              label: "Policy",
              packageId: "pkg-core",
              identifiers: [{ id: "identifier-shared", name: "policyId" }],
            },
            {
              id: "class-policy-copy",
              label: "Policy",
              packageId: "pkg-core",
              identifiers: [{ id: "identifier-shared", name: "policyIdDuplicate" }],
            },
          ],
        }),
        packs: [mimStandardsPack],
        settings: {
          enabledStandards: ["mim"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "mim_identifier_unique_within_model",
            path: "classes[class-policy-copy].identifiers[identifier-shared].id",
            effectiveSeverity: "error",
          }),
          expect.objectContaining({
            ruleId: "mim_duplicate_label_within_scope",
            path: "classes[class-policy-copy].label",
            effectiveSeverity: "warning",
          }),
        ]),
      );
    });

    it("warns on circular inheritance using a model-wide starter check", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["mim"],
          classes: [
            {
              id: "class-policy",
              label: "Policy",
              superClassIds: ["class-rule"],
            },
            {
              id: "class-rule",
              label: "Rule",
              superClassIds: ["class-policy"],
            },
          ],
        }),
        packs: [mimStandardsPack],
        settings: {
          enabledStandards: ["mim"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "mim_circular_inheritance",
            effectiveSeverity: "warning",
            explanation: expect.stringMatching(/cycle|inherit/i),
          }),
        ]),
      );
    });
  });

  describe("best-practice family", () => {
    it("surfaces naming-style drift as starter guidance instead of a stronger compliance warning", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["mim"],
          classes: [
            {
              id: "class-policy",
              label: "PolicyRule",
            },
            {
              id: "class-control",
              label: "control_rule",
            },
            {
              id: "class-guideline",
              label: "Guideline Rule",
            },
          ],
        }),
        packs: [mimStandardsPack],
        settings: {
          enabledStandards: ["mim"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "mim_naming_convention_consistency",
            effectiveSeverity: "info",
            explanation: expect.stringMatching(/starter|guidance|naming/i),
          }),
        ]),
      );
    });

    it("surfaces isolated classes as informational starter guidance", () => {
      const result = runStandardsValidation({
        model: createStandardsModel({
          profiles: ["mim"],
          classes: [
            {
              id: "class-island",
              label: "IslandClass",
            },
          ],
        }),
        packs: [mimStandardsPack],
        settings: {
          enabledStandards: ["mim"],
          ruleOverrides: {},
        },
      });

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "mim_orphaned_model_element",
            path: "classes[class-island]",
            effectiveSeverity: "info",
          }),
        ]),
      );
    });
  });

  describe("placeholder family", () => {
    it("marks deferred normative rules explicitly so future expansion is safe", () => {
      const rule = mimStandardsPack.rules.find((item) => item.ruleId === "mim_cardinality_semantics_placeholder");

      expect(rule).toMatchObject({
        category: "placeholder",
        scope: "model",
        implementationStatus: "placeholder",
        requiresGlobalContext: true,
        defaultSeverity: "warning",
        rationale: expect.stringMatching(/future|normative|cardinality/i),
      });

      expect(mimStandardsPack.rules.find((item) => item.ruleId === "mim_association_end_semantics_placeholder")).toMatchObject({
        category: "placeholder",
        implementationStatus: "placeholder",
        requiresGlobalContext: true,
        rationale: expect.stringMatching(/association|cardinality|role/i),
      });
    });

    it("keeps legacy validateStandardsModel compatibility for starter warnings", () => {
      const result = validateStandardsModel(createStandardsModel({
        profiles: ["mim"],
        classes: [
          {
            id: "class-policy",
            label: "Policy",
            superClassIds: ["class-rule"],
          },
          {
            id: "class-rule",
            label: "Rule",
            superClassIds: ["class-policy"],
          },
        ],
      }));

      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            profile: "mim",
            code: "mim_circular_inheritance",
          }),
        ]),
      );
    });
  });
});
