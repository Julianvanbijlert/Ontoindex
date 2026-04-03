import type { StandardsPackDefinition, StandardsRuleDefinition } from "@/lib/standards/engine/types";
import { mimStandardsPack } from "@/lib/standards/profiles/mim/rules";
import { nlSbbStandardsPack } from "@/lib/standards/profiles/nl-sbb/rules";
import { rdfStandardsPack } from "@/lib/standards/profiles/rdf/rules";

export const builtInStandardsPacks: StandardsPackDefinition[] = [
  mimStandardsPack,
  nlSbbStandardsPack,
  rdfStandardsPack,
];

export function getStandardsPack(standardId: string, packs = builtInStandardsPacks) {
  return packs.find((pack) => pack.standardId === standardId) || null;
}

export function listStandardsRuleCatalog(packs = builtInStandardsPacks): Array<StandardsRuleDefinition & {
  standardId: string;
  standardLabel: string;
}> {
  return packs.flatMap((pack) => pack.rules.map((rule) => ({
    ...rule,
    standardId: pack.standardId,
    standardLabel: pack.label,
  })));
}
