import type {
  StandardsFindingInput,
  StandardsPackDefinition,
  StandardsRelationSuggestion,
  StandardsRuleCategory,
  StandardsRuleContext,
  StandardsRuleDefinition,
  StandardsRuleScope,
  StandardsSeverity,
} from "@/lib/standards/engine/types";

export function isNonEmptyString(value: string | undefined | null) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isAbsoluteIri(value: string) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:.+/.test(value.trim());
}

export function isValidBlankNodeId(value: string) {
  return /^_:[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.trim());
}

export function createFinding(input: StandardsFindingInput): StandardsFindingInput {
  return input;
}

export function createRuleDefinition(input: StandardsRuleDefinition): StandardsRuleDefinition {
  return input;
}

export function createPlaceholderRule(input: {
  ruleId: string;
  title: string;
  description: string;
  rationale: string;
  explanation: string;
  defaultSeverity?: StandardsSeverity;
  scope?: StandardsRuleScope;
  category?: StandardsRuleCategory;
  requiresGlobalContext?: boolean;
}): StandardsRuleDefinition {
  return createRuleDefinition({
    ruleId: input.ruleId,
    title: input.title,
    description: input.description,
    rationale: input.rationale,
    explanation: input.explanation,
    defaultSeverity: input.defaultSeverity || "warning",
    category: input.category || "placeholder",
    scope: input.scope || "model",
    requiresGlobalContext: input.requiresGlobalContext ?? true,
    implementationStatus: "placeholder",
    validate: () => [],
  });
}

export function createInvalidIriFinding(input: {
  message: string;
  path: string;
  entityKind: string;
  entityId: string;
  field: string;
  severity?: StandardsSeverity;
}) {
  return createFinding({
    message: input.message,
    path: input.path,
    entityKind: input.entityKind,
    entityId: input.entityId,
    field: input.field,
    severity: input.severity,
  });
}

export function dedupeRelationSuggestions(suggestions: StandardsRelationSuggestion[]) {
  const byKey = new Map<string, StandardsRelationSuggestion>();

  for (const suggestion of suggestions) {
    const key = [
      suggestion.standardId,
      suggestion.selectedType,
      suggestion.customType || "",
      suggestion.label,
    ].join("::");

    if (!byKey.has(key)) {
      byKey.set(key, suggestion);
    }
  }

  return [...byKey.values()];
}

export function normalizeComparisonValue(value: string | undefined | null) {
  return value?.trim().toLowerCase() || "";
}

export function isLikelyHttpUrl(value: string | undefined | null) {
  if (!value?.trim()) {
    return false;
  }

  return /^https?:\/\/\S+$/i.test(value.trim());
}

export function detectNamingStyle(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return "empty";
  }

  if (normalized.includes(" ")) {
    return "spaced";
  }

  if (normalized.includes("_")) {
    return "snake";
  }

  if (normalized.includes("-")) {
    return "kebab";
  }

  if (/^[A-Z][A-Za-z0-9]*$/.test(normalized)) {
    return "pascal";
  }

  if (/^[a-z][A-Za-z0-9]*$/.test(normalized)) {
    return "camel";
  }

  return "mixed";
}

export function rulePackApplies(context: StandardsRuleContext, standardId: StandardsPackDefinition["standardId"]) {
  return context.settings.enabledStandards.includes(standardId)
    || context.model.profiles.includes(standardId as never);
}
