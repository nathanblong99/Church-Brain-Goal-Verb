# Roadmap (Current Architecture Migration)

This file supersedes the earlier linear "Phase 1..10" roadmap. Completed historical phases are collapsed; new focus is the migration to a validated, instrumented verb+adapter architecture plus deterministic info retrieval (unified search + calendar lookup) feeding the planner.

## Recently Completed (Historical)
- [x] Core verb stubs & outbound messaging (legacy phases 1–3.5)
- [x] Executor with templates / foreach / success checks
- [x] Basic inbound YES/NO routing
- [x] Planner (Gemini) integration + schema validation + run_goal orchestrator
- [x] Event log & basic instrumentation (planner + verb timing)
- [x] Verb argument validation layer (Zod) integrated in executor
- [x] Fallback interpolation fixes (array preservation for make_offers)
- [x] Calendar + People adapters (initial in-memory versions)
- [x] Unified search + calendar.lookup verbs (initial implementation)

## In Flight / Next
| Status | Task | Notes |
| ------ | ---- | ----- |
| [ ] | Add schemas for new verbs (`search`, `calendar.lookup`) | Extend `schemas.ts`; align executor validation |
| [ ] | Tests for search & calendar lookup | Ensure scoring logic and service-time retrieval path |
| [ ] | Integrate service-time retrieval into inbound flow | Natural language “what time is church” answered deterministically |
| [ ] | Planner prompt augmentation | Inject verb summaries + arg keys to reduce hallucinations |
| [ ] | Verb metrics aggregation | Counts, latency histograms per verb name |
| [ ] | Documentation sync (`NEW_STRATEGY.md`) | Capture migration rationale & conventions |
| [ ] | Method linter (updated scope) | Verify only registered verbs + schema-known args |
| [ ] | Invariants + state machine (rewrite scope) | Re-scope with current request model; add placeholder tests |
| [ ] | Backfill idempotency & invariants tests | Ensure regression safety |

## Deferred / Legacy Items
These items from the prior roadmap are deferred until post-migration or will be replaced:
- Staff command parser (will be superseded by natural language staff intents + classifier slots)
- KV / clock / KB adapters (stub when a method requires them)
- Retry logic on malformed planner JSON (low incidence after validation — add if logs show need)
- Reserve / schedule advanced behaviors (basic stubs exist)

## Design Principles (Active)
1. Verbs = deterministic capability surface (validated inputs, typed outputs, instrumented).
2. Adapters isolate IO (no planner or template side effects).
3. Planner sees a concise verb catalog (names + arg hints) — fewer hallucinations.
4. Natural language only for user interaction (no new rigid command tokens).
5. Deterministic retrieval before LLM generation (search + calendar.lookup) for factual answers.
6. All outbound human-facing text passes through templates or AI phrasing with compliance guard.

## Immediate Focus for Next Session
1. Add Zod schemas for `search` & `calendar.lookup` verbs; re-run tests.
2. Create `NEW_STRATEGY.md` capturing architectural migration + retrieval pattern.
3. Add targeted tests: people search ranking & service-time answer path.
4. Hook calendar lookup into inbound router for “what time” style queries.
5. Enhance planner prompt with generated verb catalog (auto from registry) and measure JSON validity rate post-change.

## Scratch Notes
- Type casting fix applied to unified search (tokens as string[]).
- Need to add validation for search args shape (domains union, q?:string, roles?:string[], campus?:string).
- Consider splitting unified search scoring util into `search_utils.ts` if logic grows.

## Progress Log (Recent)
- Added validation layer & integrated into executor.
- Fixed planner fallback referencing candidates.people.
- Implemented people & calendar adapters (service listing + lookupByDate).
- Added unified search & calendar.lookup verbs (compile errors resolved via token casting).
- Preparing to add schemas + inbound integration for service-time Q&A.

---
Historical log preserved below (legacy format) for provenance.

---
### Legacy Progress Log (Collapsed)
- Phase 1 complete: Added verb stubs (unassign, broadcast, ask, update_record, fetch_kb, reserve, schedule, enhanced notify) in `src/verbs/index.ts`.
- Phase 2 complete: Implemented executor with YAML load, interpolation, foreach, success checks.
- Phase 3.5 complete: Added template renderer, sms adapter, refactored outbound verbs, message persistence.
- Phase 3.6 partial: Basic inbound YES/NO handling implemented.
- Phase 6 partial: Core Gemini planner integrated (schema validation & test skeleton).
- Added method loader cache, events logging, run_goal orchestrator integration.
