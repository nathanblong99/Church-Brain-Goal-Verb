# Church Ops Agent — Goal/Verb Architecture

*A single combined README + AGENTS guide for your repo and IDE agents (Cursor/Copilot). Paste this at the repo root as `README.md` (you can also duplicate it as `AGENTS.md` if your tools prefer that).*

---

## Overview

This project implements a **goal-directed, data-driven agent** for church administration.

* The **Planner (LLM)** chooses a *goal* and selects a **method** that composes a tiny **standard library of verbs** (deterministic tools).
* The **Executor** runs the plan, enforces **invariants** (locks, idempotency, budgets), and advances a **request state machine**.
* Domain behavior lives in **data**: method templates (`/methods/*.yaml`) and message templates (`/templates/*.hbs`).
* Result: flexible like an AI, controllable like a workflow engine.

> Communication Principle: Every inbound and outbound human interaction is treated as open natural language. We never require (or instruct users to send) rigid ALL‑CAPS command tokens or single-word keywords beyond legally mandated carrier compliance terms (e.g., STOP, HELP). Staff and volunteers should be able to phrase requests conversationally: “Could you find three more nursery volunteers for 9am?” or “We already have enough greeters—can we scale it back to five?”. The system performs NLU (classification + slot extraction) and generates all replies via an AI phrasing layer that preserves required compliance phrases but avoids exposing internal command grammar.

---

## Repository Layout (what tools should expect)

```
/src
  /agent
    planner.ts            # LLM-facing planner: emits structured Plan (no side effects)
    frames.ts             # System/Session/Task frames (context scoping)
  /engine
    executor.ts           # deterministic runner for plans/steps
    state_machine.ts      # request lifecycle (draft → open → filled → closed)
    invariants.ts         # global checks (counts, offers, lock order, etc.)
    locks.ts              # withLock(), resource locking, deadlock order
    idempotency.ts        # idempotency key helpers for outbound actions
    events.ts             # append-only event log & correlation IDs
  /verbs                  # "standard library" of deterministic tools
    index.ts              # registry + schema validation + metrics wrapper
    search_people.ts
    make_offers.ts
    wait_for_replies.ts
    assign.ts
    unassign.ts
    broadcast.ts
    ask.ts
    update_record.ts
    fetch_kb.ts
    notify.ts
    reserve.ts
    schedule.ts
  /methods                # DATA (YAML/JSON) that compose verbs into flows
    fill_roles.yaml
    rebalance_roles.yaml
    cancel_request.yaml
  /models                 # core types (Request, Assignment, Offer, Goal, Plan, Step)
    types.ts
  /adapters               # external IO facades (SMS, DB, KV, Clock, KB)
    sms.ts
    db.ts
    kv.ts
    clock.ts
    kb.ts
  /templates              # message templates (invite, transfer, last_call, summary, apology)
    invite.hbs
    transfer.hbs
    last_call.hbs
/tests
  accept_nursery_to_children.spec.ts
  invariants.spec.ts
  idempotency.spec.ts

README.md (this file)
```

---

## Core Concepts

### Entities

* **VolunteerRequest**: `{ id, service_time, targets: Record<Ministry,number>, status, version }`
* **Assignment**: `{ request_id, volunteer_id, ministry, state: invited|accepted|declined|waitlisted|cancelled, timestamps... }`
* **Offer**: `{ request_id, volunteer_id, ministry, expires_at }`

### Invariants (enforced centrally)

1. For each ministry: `accepted_count ≤ target_count`.
2. A person has **≤ 1 active offer** per request.
3. Mutations acquire locks in a **fixed order**: `request → volunteer`.
4. Every outbound message uses a **deterministic idempotency key**:
   `msg:{request_id}:{volunteer_id}:{kind}`.

### State Machine (per request)

```
draft → open → partially_filled → filled → closed|cancelled
             ↑         │
             └─ updates┘ (rebalance stays in open/partially_filled)
```

---

## The Tiny Standard Library of Verbs (code you implement once)

> Each verb: *deterministic*, *schema-validated*, *logged*, *idempotent where applicable*.

| Verb               | Purpose (deterministic)                           | Signature (TS-ish)                                                            |                                                   |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `search_people`    | Find eligible people given a filter               | `(args:{filter: PeopleFilter}, ctx) => {people: string[]}`                    |                                                   |
| `make_offers`      | Send invites; persist Offer; idempotent           | `(args:{people:string[], role:string, time:string, expires_at:string}, ctx)`  |                                                   |
| `wait_for_replies` | Await replies until `count` or `timeout`          | `(args:{offers:string                                                         | Query, count?:number, timeout?:string}, ctx)`     |
| `assign`           | Commit person to role/time; Assignment → accepted | `(args:{person:string, role:string, time:string}, ctx)`                       |                                                   |
| `unassign`         | Move to waitlisted/cancelled with reason          | `(args:{person:string, role:string, time:string, reason?:string}, ctx)`       |                                                   |
| `broadcast`        | Send templated message to many (policy-gated)     | `(args:{people:string[], template:string, vars:Record<string,unknown>}, ctx)` |                                                   |
| `ask`              | DM a question (templated); capture response       | `(args:{person:string, question_template:string, vars:{}}, ctx)`              |                                                   |
| `update_record`    | Patch DB records (e.g., targets, version++)       | `(args:{entity_id:string, patch:Record<string,unknown>}, ctx)`                |                                                   |
| `fetch_kb`         | Retrieve authoritative facts with provenance      | `(args:{query:string}, ctx)`                                                  |                                                   |
| `notify`           | Send status summaries to staff                    | `(args:{targets:(string                                                       | PeopleFilter)[], template:string, vars:{}}, ctx)` |
| `reserve`          | Generic capacity control (optional)               | `(args:{key:string, amount:number}, ctx)`                                     |                                                   |
| `schedule`         | Enqueue future checkpoints (retries/reminders)    | `(args:{at:string, payload:{}}, ctx)`                                         |                                                   |

*All verbs must validate args via JSON Schema, honor locks/idempotency, and emit metrics.*

---

## Method Templates (DATA, not code)

Templates compose verbs to satisfy a goal. They live under `/methods` and reference **only** registered verbs.

**Schema (YAML-ish)**

```yaml
method: <string>
applicable_if: <expression>         # e.g., goal.kind == "FillRole"
steps:
  - call: <verb>
    args: <templated-args-or-object>
    out: <var-name>                 # optional
    foreach: <iterator>             # optional: "person in {{accepted}}"
success_when:
  - <expression>                    # e.g., "len(accepted) >= goal.count"
fallbacks:
  - if: <condition>
    then:
      - call: <verb>
        args: { ... }
```

**Example: `fill_roles.yaml`**

```yaml
method: fill_roles
applicable_if: goal.kind == "FillRole"
steps:
  - call: search_people
    args: { filter: { roles: ["{{goal.role}}"], campus: "{{ctx.campus}}", is_active: true } }
    out: candidates
  - call: make_offers
    args: { people: "{{candidates}}", role: "{{goal.role}}", time: "{{goal.time}}", expires_at: "{{now + 24h}}" }
    out: offers
  - call: wait_for_replies
    args: { offers: "{{offers}}", count: "{{goal.count}}", timeout: "6h" }
    out: accepted
  - call: assign
    foreach: person in accepted
    args: { person: "{{person}}", role: "{{goal.role}}", time: "{{goal.time}}" }
  - call: notify
    args: { targets: ["pastor_of_{{goal.role}}"], template: "filled_n_of_m", vars: { n: "{{len(accepted)}}", m: "{{goal.count}}" } }
success_when:
  - "len(accepted) >= goal.count"
fallbacks:
  - if: "timeout"
    then:
      - call: broadcast
        args: { people: "{{candidates.minus(accepted)}}", template: "last_call", vars: { role: "{{goal.role}}", time: "{{goal.time}}" } }
      - call: wait_for_replies
        args: { offers: "pending_for(goal.role, goal.time)", count: "{{goal.count}}", timeout: "2h" }
```

**Example: `rebalance_roles.yaml`**

```yaml
method: rebalance_roles
applicable_if: goal.kind == "RebalanceTargets"
steps:
  - call: update_record
    args: { entity_id: "{{req.id}}", patch: { targets: "{{goal.targets}}", version: "{{req.version + 1}}" } }
  - call: search_people
    args: { filter: { assigned_to: { role: "nursery", time: "{{goal.time}}" } } }
    out: nursery_assigned
  - call: unassign
    foreach: person in "{{latest(nursery_assigned, overfill('nursery', goal.targets))}}"
    args: { person: "{{person}}", role: "nursery", time: "{{goal.time}}", reason: "rebalance" }
  - call: ask
    foreach: person in "{{those_unassigned}}"
    args: { person: "{{person}}", question_template: "transfer_to_children", vars: { time: "{{goal.time}}" } }
  - call: fill_roles
    with: { goal: { kind: "FillRole", role: "children", count: "{{goal.targets.children}}", time: "{{goal.time}}" } }
success_when:
  - "targets_satisfied(goal.targets, time=goal.time)"
```

---

## Planner Contract (what the LLM must output)

* Planner outputs **validated JSON** referencing only known verbs/methods.
* Planner has **no side effects**; executor performs all IO.

New required field since rationale enhancement:

* `rationale` (string, <= ~120 chars target): concise justification for chosen method and step ordering.
* Local (not LLM-required) enrichment: `complexity_score` (number) = distinct_verbs + 0.5 * steps. Added after validation for observability/escalation heuristics. Not part of the schema contract the model must satisfy, but may appear in logs.

**Example**

```json
{
  "goal": { "kind": "FillRole", "role": "nursery", "count": 5, "time": "2025-10-05T09:00:00-05:00" },
  "method": "fill_roles",
  "rationale": "Invite active nursery volunteers, wait for accepts, then assign and notify.",
  "steps": [
    { "call": "search_people", "args": { "filter": { "roles": ["nursery"], "is_active": true } }, "out": "candidates" },
    { "call": "make_offers", "args": { "people": "{{candidates}}", "role": "nursery", "time": "{{goal.time}}", "expires_at": "{{now+24h}}" }, "out": "offers" },
    { "call": "wait_for_replies", "args": { "offers": "{{offers}}", "count": 5, "timeout": "6h" }, "out": "accepted" },
    { "call": "assign", "foreach": "person in accepted", "args": { "person": "{{person}}", "role": "nursery", "time": "{{goal.time}}" } }
  ],
  "success_when": ["len(accepted) >= goal.count"],
  "complexity_score": 4.5
}
```

**Frames:**

* **System Frame** (immutable policies & JSON-only tool rules)
* **Session Frame** (tenant/campus/budgets)
* **Task Frame** (current goal + method)
  Planner rebuilds context from state—no raw chat history carryover.

---

## Concurrency: Per-Request Serialization (beginner-friendly)

**Goal:** only one thing edits the same `VolunteerRequest` at a time.

### Option A — Queue partitioning (simple + scalable)

* Enqueue events with `partitionKey = request_id`.
* All events for the same request are processed **in order by a single worker**.
* Different requests run in parallel on other workers.

### Option B — Mutex/Lock around critical sections

* Before mutating `REQ123`, acquire `lock:request:REQ123` (Redis `SETNX PX`, or Postgres advisory locks).
* Release after commit; use TTLs to prevent stuck locks.
* If you need two locks, always lock in the same order: **request → volunteer**.

### Belt + suspenders

* Many teams do A **plus** a short lock in code.

**Idempotency key pattern (outbound):**

```
msg:{request_id}:{volunteer_id}:{kind}
```

Short-circuit if the key already exists.

---

## Safety Rails

* **Policy gates:** broadcasts above N recipients, calendar overrides, or spend > $X require `supervisor_ok`.
* **Budgets/timeboxes:** cap messages, fan-out/minute, and method duration.
* **"Ask-then-act" default:** if confidence low or KB stale, ask a targeted question or escalate.
* **Kill switch per tenant:** pause all side effects; stay read-only.
* **Shadow mode:** run new methods dry (log "would do X") before enabling automation.

---

## Observability & Audit

* Append-only **event log** with:

  * correlation_id
  * planner output JSON
  * each verb call input/output
  * invariant checks & state transitions
* Redact PII in logs as needed.
* Metrics: requests open/filled, time-to-fill, retries, fan-out per tenant, planner calls per goal.

---

## User Interaction Channels (Volunteers & Staff)

Primary interface for **both volunteers and staff** is **SMS**. A lightweight desktop/web portal is optional for convenience (richer logs, dashboards, bulk actions) but not required for day‑to‑day operation.

### Volunteer SMS Patterns
* Invitations / confirmations are phrased conversationally; volunteers may answer with natural language ("Sure I can help", "I can't this week"). Minimal canonical shortcuts YES / NO are still understood, but not required.
* Clarification / transfer prompts accept full-sentence answers.
* Mandatory carrier compliance keywords (STOP, HELP) are respected verbatim.

### Staff SMS Patterns (Natural Language First)
Staff initiate operations conversationally, e.g.:

* “Fill 5 nursery spots for the 9am service.”
* “What’s the status of children’s ministry volunteers this Sunday at 11?”
* “Scale greeters at 10am back to 5—we already have enough.”
* “Cancel the 7pm rehearsal next Thursday.”

The system internally maps these to intents (fill_role_request, ask_status, staff_reduce_target, staff_cancel_event, etc.).

#### Legacy / Debug Command Grammar (Not Shown to Users)
For internal testing, terse tokens (STATUS, FILL, REB, CANCEL) may still be parsed, but product surfaces and outbound replies should never instruct users to send these tokens. They are strictly a *backdoor convenience*.

### Inbound Routing Logic
1. Normalize incoming text (trim; uppercase for command token).
2. Perform natural language intent classification (volunteer vs staff determined by directory/roles + intent features).
3. Build structured intent (kind + extracted slots) → create goal/method invocation → enqueue executor if side effects are required.
4. If volunteer response maps to an offer / clarification prompt → update assignment state.
5. If low confidence or missing required slots → send an AI-generated clarification question (never a rigid syntax error message).
6. Unknown after clarification attempts → contextually helpful fallback explaining examples in natural language.

### Adapter Responsibilities
* `sms` adapter handles outbound sends (idempotent) for all parties.
* Inbound webhook (Twilio) funnels into `handleInboundMessage({ from, body, received_at })`.
* Staff commands still route through planner/executor so invariants & logging remain consistent.

### Rationale for SMS-First
* Minimal friction: quick confirmations/declines.
* Works during setup windows when staff are mobile.
* Desktop portal can layer insights later without blocking core adoption.

### Desktop / Portal (Optional Enhancement)
* Real-time dashboard of open requests and fill progress.
* Event log tail & search.
* Admin policy approvals (large broadcast, overrides).

---

## Tests (Definition of Done)

* **Verb registry** exists; each verb has a **JSON Schema** + tests.
* Executor is the **only** component with side effects.
* State machine & `invariants.ts` enforce the 4 invariants.
* Single `withLock` implementation; tests cover race scenarios (dual replies).
* **Idempotency** helpers used by all outbound adapters.
* `/methods/*.yaml` reference only registered verbs; linter validates templates.
* Message templates in `/templates` (no inline strings in verbs).

**Scenario test to include (`/tests/accept_nursery_to_children.spec.ts`):**

```ts
it("fills nursery=5 then rebalances to nursery=4, children=3 with fair transfers", async () => {
  const req = await openRequest({ time: "2025-10-05T09:00:00-05:00", targets: { nursery:5 }});
  await runMethod("fill_roles", { goal: { kind:"FillRole", role:"nursery", count:5, time:req.time }, req });

  // Simulate 5 acceptances in order
  for (const v of ["A","B","C","D","E"]) await volunteerRepliesYes(req.id, v, "nursery");

  // Update targets
  await runMethod("rebalance_roles", { goal: { kind:"RebalanceTargets", targets: { nursery:4, children:3 }, time:req.time }, req });

  // Expect: E (most recent) offered transfer first
  expect(getMessagesTo("E")).toContain("transfer_to_children");
  // After E accepts transfer and 2 more accept from children pool → targets satisfied
  await volunteerAcceptTransfer(req.id, "E", "children");
  await childrenPoolAccepts(req.id, ["X","Y"]);

  const counts = await countsByMinistry(req.id);
  expect(counts.nursery.accepted).toBe(4);
  expect(counts.children.accepted).toBe(3);
  expect(invariantsHold(req.id)).toBe(true);
});
```

---

## Retrofit Guide (mapping existing code)

| If you currently have…                   | Replace with…                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `sendNurseryInvites()`                   | method `fill_roles.yaml` + verbs `search_people`, `make_offers`, `wait_for_replies`, `assign` |
| `rebalanceNurseryChildren()`             | method `rebalance_roles.yaml` + verbs `unassign`, `ask`, `fill_roles`                         |
| Inline SMS strings                       | `/templates/*.hbs`                                                                            |
| Model calling tools directly in handlers | `planner.ts` only (no side effects)                                                           |
| Ad-hoc retries/timeouts                  | `schedule` verb + method `fallbacks`                                                          |

---

## Quick Grep Cues (for IDE agents)

* `register({ name: "search_people"` …) — all verbs present & exported
* `withLock("request:` and `withLock("volunteer:` — fixed order usage only
* `msg:` idempotency keys used in `/adapters/sms.ts` (or similar)
* `/methods/*.yaml` with `method:` and `steps:` using only registered `call:` names
* `success_when:` and `fallbacks:` present in methods
* Tests referencing `rebalance_roles` and checking latest-accepted demotion

---

## Setup & Commands

* **Node 20+**, pnpm or npm
* Install: `pnpm install` *(or)* `npm ci`
* Dev: `pnpm dev` *(or)* `npm run dev`
* Tests: `pnpm test` *(or)* `npm test`
* Typecheck/Lint: `pnpm typecheck && pnpm lint`

Local helpers (optional if you add scripts):

* Seed demo data: `pnpm seed`
* Simulator: `pnpm simulate:nursery` (nursery=5 → update to 4+3)
* Logs: `pnpm logs --follow`

---

## Minimal TS Stubs (so agents know what to look for)

```ts
// models/types.ts
export type Ministry = "nursery" | "children" | string;

export type VolunteerRequest = {
  id: string;
  service_time: string; // ISO
  targets: Record<Ministry, number>;
  status: "draft" | "open" | "partially_filled" | "filled" | "closed" | "cancelled";
  version: number;
};

export type Goal =
  | { kind: "FillRole"; role: Ministry; count: number; time: string }
  | { kind: "RebalanceTargets"; targets: Record<Ministry, number>; time: string }
  | { kind: "CancelRequest"; request_id: string };

// engine/locks.ts
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {/* impl */}

// engine/idempotency.ts
export const msgKey = (reqId:string, personId:string, kind:string) =>
  `msg:${reqId}:${personId}:${kind}`;

// verbs/index.ts
export type Verb = { name:string; schema:object; run:(args:any, ctx:any)=>Promise<any> };
const registry: Record<string,Verb> = {};
export function register(v:Verb){ registry[v.name]=v; }
export function getVerb(name:string){ if(!registry[name]) throw new Error(`Unknown verb ${name}`); return registry[name]; }
```

---

## Agent Policy (for IDE Agents like Copilot/Cursor)

* Prefer editing **methods** and **templates** to change behavior.
* Only add new **verbs** if a capability cannot be expressed by existing verbs.
* Planner must output **validated JSON** and reference only registered verbs/methods.
* Do **not** send messages or write DB from planner code.
* Use **locks** and **idempotency** helpers from `/engine` and `/adapters`.
* Outbound human-facing text must flow through the AI reply generator (or a template that is itself post-processed) to maintain conversational tone and adherence to the Natural Language Only principle.
* Do not add new user-visible keyword commands; extend classifier and NLU extraction instead.

---

## Security Notes

* **Prompt safety:** never mix untrusted user text with instructions; delimit and label inputs.
* **KB write-backs:** only from trusted roles; store provenance & reviewer.
* **Access control:** RBAC for high-impact verbs (broadcast, calendar overrides, spend).

---

## Contact / Escalation

* Owner: Beam Creative — Ops Agent Team
* Support: [ops@beamcreative.co](mailto:ops@beamcreative.co)

---

**Summary:** This blueprint keeps the AI **flexible** (planning + phrasing) and the system **controllable** (verbs, locks, invariants, templates). If your repo matches this doc, you'll be scalable, stable, and sustainable from day one.