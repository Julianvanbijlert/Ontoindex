import type {
  StandardsFindingInput,
  StandardsPackDefinition,
  StandardsRelationSuggestion,
  StandardsRuleContext,
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

export function rulePackApplies(context: StandardsRuleContext, standardId: StandardsPackDefinition["standardId"]) {
  return context.settings.enabledStandards.includes(standardId)
    || context.model.profiles.includes(standardId as never);
}
