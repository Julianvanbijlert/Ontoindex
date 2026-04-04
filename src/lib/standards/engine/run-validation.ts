import type {
  RunStandardsValidationInput,
  RunStandardsValidationResult,
  StandardsFinding,
  StandardsFindingInput,
  StandardsPackDefinition,
  StandardsSummary,
} from "@/lib/standards/engine/types";
import { dedupeRelationSuggestions } from "@/lib/standards/profiles/shared";

function createSummary(): StandardsSummary {
  return {
    info: 0,
    warning: 0,
    error: 0,
    blocking: 0,
  };
}

function finalizeFinding(input: {
  pack: StandardsPackDefinition;
  rule: StandardsPackDefinition["rules"][number];
  finding: StandardsFindingInput;
  effectiveSeverity: StandardsFinding["effectiveSeverity"];
  index: number;
}): StandardsFinding {
  const severity = input.finding.severity || input.rule.defaultSeverity;

  return {
    ...input.finding,
    id: `${input.pack.standardId}:${input.rule.ruleId}:${input.index}:${input.finding.path}`,
    standardId: input.pack.standardId,
    ruleId: input.rule.ruleId,
    title: input.rule.title,
    description: input.rule.description,
    rationale: input.rule.rationale,
    category: input.rule.category,
    scope: input.rule.scope,
    requiresGlobalContext: input.rule.requiresGlobalContext,
    implementationStatus: input.rule.implementationStatus,
    explanation: input.finding.explanation || input.rule.explanation,
    severity,
    effectiveSeverity: input.effectiveSeverity,
    blocking: input.effectiveSeverity === "blocking",
    profile: input.pack.standardId,
    code: input.rule.ruleId,
  };
}

export function runStandardsValidation(input: RunStandardsValidationInput): RunStandardsValidationResult {
  const summary = createSummary();
  const findings: StandardsFinding[] = [];
  const enabledStandards = new Set(input.settings.enabledStandards);
  const context = {
    model: input.model,
    settings: input.settings,
    relationshipDraft: input.context?.relationshipDraft,
  };

  input.packs
    .filter((pack) => enabledStandards.has(pack.standardId))
    .forEach((pack) => {
      pack.rules.forEach((rule) => {
        const ruleFindings = rule.validate(context);

        ruleFindings.forEach((finding, index) => {
          const effectiveSeverity = input.settings.ruleOverrides[rule.ruleId]
            || finding.severity
            || rule.defaultSeverity;
          const finalized = finalizeFinding({
            pack,
            rule,
            finding,
            effectiveSeverity,
            index,
          });

          summary[finalized.effectiveSeverity] += 1;
          findings.push(finalized);
        });
      });
    });

  const relationSuggestions = dedupeRelationSuggestions(
    input.packs
      .filter((pack) => enabledStandards.has(pack.standardId))
      .flatMap((pack) => pack.getRelationSuggestions?.(context) || []),
  );

  return {
    findings,
    relationSuggestions,
    summary,
    hasBlockingFindings: findings.some((finding) => finding.blocking),
  };
}
