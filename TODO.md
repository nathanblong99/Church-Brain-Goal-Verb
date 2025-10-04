# TODO Roadmap

(We will check these off sequentially as implemented.)

## Phase 1: Core Verbs
- [x] Implement remaining verbs: unassign, broadcast, ask, update_record, fetch_kb, reserve, schedule (and flesh out notify) with simple in-memory behavior & argument validation stubs.

## Phase 2: Executor
- [x] Create executor (`src/engine/executor.ts`) to run a method: load YAML, render templates, run verbs, foreach expansion, capture outputs, evaluate `success_when`.

## Phase 3: Method & Template Infrastructure
- [x] Method loader + cache (`method_loader.ts`) and simple expression/template rendering (Handlebars for templates + lightweight interpolation for expressions).
- [x] Template renderer module (`templates.ts`) compiling and caching `.hbs`.

## Phase 3.5: Messaging Channel
- [x] Implement `sms` adapter (in-memory for dev; idempotency integration).
- [x] Outbound verbs (`make_offers`, `broadcast`, `ask`, `notify`) use template renderer + sms adapter.
- [x] Add message persistence (messages table in in-memory db adapter).
- [x] Implement idempotent key check `msgKey` usage inside each sending verb.

## Phase 3.6: Inbound & Staff Commands
- [x] `inbound_router.ts` to classify volunteer vs staff replies (basic YES/NO + unhandled).
- [ ] Staff command parser supporting: STATUS, REB, CANCEL, FILL, SUMMARY, HELP.
- [ ] Simulation helper `simulateInbound` for tests (currently handled inline via `handleInbound`).
- [ ] Update scenario tests to use inbound YES instead of direct assignment calls.

## Phase 4: Invariants & State Machine
- [ ] Implement `invariants.ts` skeleton with 4 invariants.
- [ ] Implement `state_machine.ts` with transitions draft→open→partially_filled/filled.

## Phase 5: Adapters & Events
- [ ] Implement adapters (`sms.ts`, `db.ts`, `kv.ts`, `clock.ts`, `kb.ts`) with in-memory implementations. (sms & db done; kv/clock/kb pending)
- [x] Implement `events.ts` append-only log utilities.

## Phase 6: Gemini Planner Integration
- [x] Add @google/generative-ai dependency
- [x] Implement `plan_schema.ts` with Ajv validator
- [x] Implement `gemini_client.ts` + `planner.ts` using Gemini JSON output
- [x] Add `planner.spec.ts` (skips if no API key)
- [x] Add orchestrator `run_goal.ts` linking planner + executor
- [x] Log planner & execution events
- [ ] Retry logic on malformed JSON
- [ ] Safety: max steps cap & method existence pre-check

## Phase 7: Method Linter
- [ ] Add `method_linter.ts` verifying all `call:` names correspond to registered verbs and report unknown variables (basic pass).

## Phase 8: Tests
- [ ] Add invariants test.
- [ ] Add idempotency test.
- [ ] Add scenario test `accept_nursery_to_children.spec.ts` (skeleton / partial simulation).

## Phase 9: Documentation Sync
- [ ] Update `README.md` (copy of Agent.md) & mark completed items, adjust examples if needed.

## Phase 10: Polish
- [ ] Add JSON Schema / zod validation per verb.
- [ ] Add metrics emission stubs in registry wrapper.
- [ ] Add fallback handling (not yet implemented in executor).

---
Progress log will be appended below as tasks are completed.

## Progress Log
- Phase 1 complete: Added verb stubs (unassign, broadcast, ask, update_record, fetch_kb, reserve, schedule, enhanced notify) in `src/verbs/index.ts`.
- Phase 2 complete: Implemented executor with YAML load, interpolation, foreach, success checks.
- Phase 3.5 complete: Added template renderer, sms adapter, refactored outbound verbs, message persistence.
- Phase 3.6 partial: Basic inbound YES/NO handling implemented.
- Phase 6 partial: Core Gemini planner integrated (schema validation & test skeleton).
- Added method loader cache, events logging, run_goal orchestrator integration.
