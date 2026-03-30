# Grounded Chat System

## Overview

The chat subsystem is retrieval-first and evidence-first.

Flow in v1:

1. The frontend chat controller accepts a user message.
2. It reuses the existing search context collector and `SearchRetrievalGateway`.
3. It applies conservative synonym expansion for chat only, using `relationships.type = 'synonym_of'`.
4. It builds a validated evidence pack from grounded search results.
5. It sends the evidence pack, retrieval summary, and chat settings to the `chat-complete` Edge Function.
6. The Edge Function loads bounded chat history, builds provider-independent prompts, calls the configured LLM provider, validates citations, persists chat messages/logs, and returns a normalized answer.

## Key boundaries

- Frontend retrieval orchestration:
  - `src/lib/chat/chat-controller.ts`
  - Reuses `src/lib/search-retrieval-gateway.ts`
- Evidence and safety:
  - `src/lib/chat/evidence-pack-builder.ts`
  - `src/lib/chat/citation-validator.ts`
- Similarity/synonym support:
  - `src/lib/chat/synonym-expansion.ts`
- Provider abstraction:
  - `src/lib/chat/types.ts`
  - `src/lib/chat/provider-factory.ts`
  - `src/lib/chat/providers/*`
- Backend generation and persistence:
  - `supabase/functions/chat-complete/index.ts`

## Provider switching

Chat generation is configured through environment variables and does not require code changes.

Required server-side variables:

- `LLM_PROVIDER`
- `LLM_MODEL`
- `LLM_API_KEY`

Optional server-side variables:

- `LLM_BASE_URL`
- `LLM_TEMPERATURE`
- `LLM_MAX_TOKENS`

Supported provider values today:

- `mock`
- `openai`
- `openai-compatible`
- `anthropic`

Embeddings remain a separate concern and continue to use the existing search embedding configuration for the search subsystem.

## Similarity and synonym handling

Chat does not replace hybrid retrieval.

Instead it:

- starts from the user query
- runs the existing search query understanding
- optionally expands the query with `synonym_of` graph links for short non-exact queries
- calls the hybrid retrieval gateway once with the expanded query
- records expansion provenance in the evidence pack and chat log

The goal is to improve semantic recall without weakening exact-match-sensitive behavior.

## Grounding and citation safety

- The LLM only receives the evidence pack, not raw database access.
- Citations must map to real evidence ids such as `E1`.
- Invalid citations are removed or downgraded.
- In strict mode, unsupported answers fall back to a clarification/refusal path.
- Tombstoned or deleted entities are excluded from the evidence pack before generation.

## Persistence

The subsystem adds:

- `chat_sessions`
- `chat_messages`
- `chat_context_summaries`
- `chat_logs`

These tables use user-scoped RLS and service-role maintenance access.

## Current v1 tradeoff

To avoid duplicating the mature search stack, retrieval orchestration remains app-side in v1, while provider execution and chat persistence are server-side.

That keeps search reuse exact and provider secrets fully server-side.

If a future phase extracts a shared server-safe search core, retrieval can move entirely behind the backend controller without changing the chat UI contract.
