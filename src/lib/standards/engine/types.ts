import type { Json } from "@/integrations/supabase/types";
import type { RelationshipSelection } from "@/lib/relationship-service";
import type { StandardsModel, StandardsProfile } from "@/lib/standards/model";

export type StandardsSeverity = "info" | "warning" | "error" | "blocking";

export interface StandardsRuntimeSettings {
  enabledStandards: string[];
  ruleOverrides: Record<string, StandardsSeverity>;
}

export interface StandardsRuleContext {
  model: StandardsModel;
  settings: StandardsRuntimeSettings;
  relationshipDraft?: {
    sourceDefinitionId?: string;
    sourceTitle?: string;
    targetDefinitionId?: string;
    targetTitle?: string;
    selectedType?: RelationshipSelection;
    customType?: string;
  };
}

export interface StandardsRelationSuggestion {
  id: string;
  standardId: string;
  label: string;
  explanation: string;
  selectedType: RelationshipSelection;
  customType?: string;
  metadata?: Json;
}

export interface StandardsFindingInput {
  message: string;
  path: string;
  explanation?: string;
  severity?: StandardsSeverity;
  entityKind?: string;
  entityId?: string;
  field?: string;
  relatedEntityId?: string;
  metadata?: Record<string, unknown>;
  suggestion?: StandardsRelationSuggestion;
}

export interface StandardsFinding extends StandardsFindingInput {
  id: string;
  standardId: string;
  ruleId: string;
  severity: StandardsSeverity;
  effectiveSeverity: StandardsSeverity;
  blocking: boolean;
  profile: StandardsProfile | string;
  code: string;
}

export interface StandardsRuleDefinition {
  ruleId: string;
  title: string;
  description: string;
  explanation: string;
  defaultSeverity: StandardsSeverity;
  validate: (context: StandardsRuleContext) => StandardsFindingInput[];
}

export interface StandardsPackDefinition {
  standardId: StandardsProfile | string;
  label: string;
  description: string;
  rules: StandardsRuleDefinition[];
  getRelationSuggestions?: (context: StandardsRuleContext) => StandardsRelationSuggestion[];
}

export interface StandardsSummary {
  info: number;
  warning: number;
  error: number;
  blocking: number;
}

export interface RunStandardsValidationInput {
  model: StandardsModel;
  packs: StandardsPackDefinition[];
  settings: StandardsRuntimeSettings;
  context?: {
    relationshipDraft?: StandardsRuleContext["relationshipDraft"];
  };
}

export interface RunStandardsValidationResult {
  findings: StandardsFinding[];
  relationSuggestions: StandardsRelationSuggestion[];
  summary: StandardsSummary;
  hasBlockingFindings: boolean;
}
