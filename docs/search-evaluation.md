# Search Evaluation Report

## Scope

This report covers the fixture-based offline benchmark introduced in `src/lib/search-evaluation.ts`.

It is intentionally small and deterministic:

- 4 judged queries
- lexical-only baseline
- hybrid retrieval
- hybrid retrieval plus reranking

The goal is not to claim production-quality absolute scores yet. The goal is to validate that the new ranking stack improves semantic first-hit quality without regressing recall on the benchmark fixture.

## Results

### Lexical-only baseline

- Recall@5: 1.000
- Precision@5: 0.450
- MRR: 0.625
- nDCG@5: 0.628

### Hybrid retrieval

- Recall@5: 1.000
- Precision@5: 0.450
- MRR: 1.000
- nDCG@5: 1.000

### Hybrid retrieval + reranking

- Recall@5: 1.000
- Precision@5: 0.450
- MRR: 1.000
- nDCG@5: 1.000

## Interpretation

- Recall stayed flat on the fixture, which is good: the hybrid stack did not lose relevant documents.
- The primary gain is ranking quality:
  - MRR improved from `0.625` to `1.000`
  - nDCG@5 improved from `0.628` to `1.000`
- On this benchmark, the dense + fusion path is what closes the semantic gap; reranking then preserves the improved ordering.

## Caveats

- This is a fixture benchmark, not a production log replay.
- The current reranker is deterministic and feature-based, not a model-serving cross-encoder.
- Dense retrieval quality in production depends on embedding freshness and provider configuration in the Edge Functions.

## Next Evaluation Steps

- Add manually judged queries from real platform usage.
- Break out results by intent class:
  - navigational
  - informational
  - exploratory
- Compare online click-through and reformulation rates once query logs accumulate.
