# Standards Pack Authoring Notes

The standards engine in this repository is intentionally pack-oriented:

- add a new pack by exporting a `StandardsPackDefinition`
- register it in `src/lib/standards/engine/registry.ts`
- keep the canonical `StandardsModel` as the source of truth

## Adding a Rule

Each rule should define:

- `ruleId`: stable, override-safe identifier
- `title`: concise admin-facing label
- `description`: short summary for catalog UIs
- `rationale`: why the rule matters
- `explanation`: what is wrong, why it matters, and what to do next
- `defaultSeverity`: shipped starter policy
- `category`: `required`, `consistency`, `publication`, `best-practice`, or `placeholder`
- `scope`: the main target area such as `class`, `concept`, `conceptRelation`, or `model`
- `requiresGlobalContext`: `true` when the rule needs ontology-wide context
- `implementationStatus`: `starter` or `placeholder`

## Choosing Severity

- Use `warning` for most starter authoring guidance.
- Use `error` for clear structural inconsistencies such as broken references or malformed IRIs.
- Reserve `blocking` for admin overrides or truly hard constraints already encoded elsewhere in the application.
- Use `info` for heuristic or editorial hints that may improve quality but should not read like strong compliance failures.

## Compliance Rules vs Editorial Hints

Use an active standards rule when:

- the repository already encodes the needed semantics clearly
- the finding maps to a recognizable structural or publication concern
- the message can stay honest without pretending to implement the full normative catalog

Use a softer editorial or heuristic hint when:

- the logic depends on naming style, terseness, or authoring preference
- the signal is useful but prone to legitimate exceptions
- the repository does not carry enough context to claim strong compliance semantics

Editorial or heuristic hints should:

- prefer `info`
- say they are starter guidance or a hint in the title, description, or explanation
- avoid claiming normative certainty

## Placeholder Rules

Use explicit placeholder rules when:

- the canonical model does not yet carry enough semantics
- the authoritative normative catalog is not yet encoded
- a future rule likely needs reasoner-like or ontology-wide behavior

Placeholder rules should:

- say they are placeholders in the title or description
- explain what future expansion they reserve space for
- default to `warning`
- return no findings until the repository can support them honestly

Use a placeholder instead of an active starter rule when:

- the missing semantics would otherwise force brittle heuristics
- the canonical model does not yet carry the right data
- future expansion depends on an external normative catalog, reasoner, or profile definition

## Avoiding Overclaiming

- Prefer “recommended in starter catalog” or “starter hint” language for non-critical starter rules.
- Keep malformed-term and broken-reference checks strong when the repository evidence supports them.
- If a rule is only a shallow approximation, say so in the explanation or turn it into a placeholder.

## Future Packs

SKOS packs, OWL profile packs, and organization-specific packs should follow the same pattern:

- keep normative logic inside the pack
- keep UI rendering separate
- prefer starter rules first, then deepen them only when source semantics are encoded and testable
