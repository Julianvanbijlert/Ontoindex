import { builtInStandardsPacks } from "@/lib/standards/engine/registry";
import { runStandardsValidation } from "@/lib/standards/engine/run-validation";
import type { StandardsSeverity } from "@/lib/standards/engine/types";
import type { StandardsModel, StandardsProfile } from "@/lib/standards/model";

export type StandardsValidationSeverity = "error" | "warning";

export interface StandardsValidationIssue {
  profile: StandardsProfile | "core";
  severity: StandardsValidationSeverity;
  code: string;
  message: string;
  path: string;
}

export interface StandardsValidationResult {
  valid: boolean;
  issues: StandardsValidationIssue[];
  errors: StandardsValidationIssue[];
  warnings: StandardsValidationIssue[];
}

function toLegacySeverity(severity: StandardsSeverity): StandardsValidationSeverity {
  return severity === "warning" || severity === "info" ? "warning" : "error";
}

export function validateStandardsModel(model: StandardsModel): StandardsValidationResult {
  const validation = runStandardsValidation({
    model,
    packs: builtInStandardsPacks,
    settings: {
      enabledStandards: model.profiles,
      ruleOverrides: {},
    },
  });
  const issues = validation.findings.map((finding) => ({
    profile: finding.profile as StandardsProfile | "core",
    severity: toLegacySeverity(finding.severity),
    code: finding.code,
    message: finding.message,
    path: finding.path,
  }));

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning"),
  };
}
