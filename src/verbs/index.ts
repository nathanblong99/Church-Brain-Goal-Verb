// Verb registry & standard library stubs
// NOTE: Keep each verb deterministic and side-effect isolated to provided adapters.
// Validation: using a tiny inline validator now; will replace with zod/ajv schemas later.

export type VerbContext = {
  now: () => Date;
  emit: (event: string, payload: any) => void;
  env: Record<string, any>;
  // adapters
  sms?: { send: (to: string, body: string, key?: string) => Promise<void> };
};

export type Verb = {
  name: string;
  schema: object; // TODO JSON Schema refinement
  run: (args: any, ctx: VerbContext) => Promise<any>;
};

const registry: Record<string, Verb> = {};

export function register(v: Verb) {
  if (registry[v.name]) throw new Error(`Verb already registered: ${v.name}`);
  registry[v.name] = v;
}

export function getVerb(name: string): Verb {
  const v = registry[name];
  if (!v) throw new Error(`Unknown verb ${name}`);
  return v;
}

export function listVerbs() {
  return Object.keys(registry);
}

import { db } from '../adapters/db.js';
import { sms } from '../adapters/sms.js';
import * as peopleDb from '../adapters/people_db.js';
import * as churchInfo from '../adapters/church_info_db.js';
import { renderTemplate } from '../engine/templates.js';
// Example stub verbs to allow initial tests
register({
  name: "search_people",
  schema: {},
  async run(args) {
    try {
      const matches = peopleDb.query(args?.filter || {});
      return { people: matches.map(m => m.id) };
    } catch (e) {
      // fallback if dataset not present yet
      return { people: ["A", "B", "C", "D", "E", "X", "Y", "Z"] };
    }
  },
});

register({
  name: "make_offers",
  schema: {},
  async run(args) {
    const now = new Date();
    const requestId = args.request_id || 'REQ';
    const offers = (args.people || []).map((p: string) => {
      const offer = { request_id: requestId, volunteer_id: p, ministry: args.role, expires_at: args.expires_at || new Date(now.getTime()+24*3600*1000).toISOString(), created_at: now.toISOString() };
      db.createOffer(offer);
      return offer;
    });
    for (const o of offers) {
      const body = await renderTemplate('invite', { name: o.volunteer_id, role: o.ministry, time: args.time });
      await sms.send({ to: o.volunteer_id, body, keyParts: { requestId: o.request_id, personId: o.volunteer_id, kind: 'invite' }, template: 'invite' });
    }
    return { offers };
  },
});

register({
  name: "wait_for_replies",
  schema: {},
  async run(args) {
    // naive: accept first N
    const count = args.count || 1;
    return { accepted: (args.offers || []).slice(0, count).map((o: any) => o.person) };
  },
});

register({
  name: "assign",
  schema: {},
  async run(args) {
    const assignment = db.createAssignment({ request_id: args.request_id || 'REQ', volunteer_id: args.person, ministry: args.role, state: 'accepted', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    return { assignment };
  },
});

register({
  name: "notify",
  schema: {},
  async run(args, ctx) {
    const people: string[] = args.targets || [];
    for (const p of people) {
      const body = await renderTemplate(args.template, { ...(args.vars||{}), name: p });
      await sms.send({ to: p, body, keyParts: { requestId: args.request_id || 'REQ', personId: p, kind: args.template }, template: args.template });
    }
    ctx.emit?.('notify', { count: people.length, template: args.template });
    return { notified: people.length };
  },
});

register({
  name: "unassign",
  schema: {},
  async run(args, ctx) {
    db.updateAssignmentState(args.request_id || 'REQ', args.person, args.role, 'cancelled');
    ctx.emit?.('unassign', { args });
    return { unassigned: args.person };
  },
});

register({
  name: "broadcast",
  schema: {},
  async run(args, ctx) {
    const people: string[] = args.people || [];
    for (const p of people) {
      const body = await renderTemplate(args.template, { ...(args.vars||{}), name: p });
      await sms.send({ to: p, body, keyParts: { requestId: args.request_id || 'REQ', personId: p, kind: args.template }, template: args.template });
    }
    ctx.emit?.('broadcast', { to: people, template: args.template });
    return { sent: people.length };
  },
});

register({
  name: "ask",
  schema: {},
  async run(args, ctx) {
    const body = await renderTemplate(args.question_template, { ...(args.vars||{}), name: args.person });
    await sms.send({ to: args.person, body, keyParts: { requestId: args.request_id || 'REQ', personId: args.person, kind: args.question_template }, template: args.question_template });
    ctx.emit?.('ask', { person: args.person, template: args.question_template });
    return { asked: args.person };
  },
});

register({
  name: "update_record",
  schema: {},
  async run(args, ctx) {
    ctx.emit?.("update_record", { entity_id: args.entity_id, patch: args.patch });
    return { updated: args.entity_id };
  },
});

register({
  name: "fetch_kb",
  schema: {},
  async run(args, ctx) {
    const q = args.query || '';
    const facts = churchInfo.searchFacts(q).map(f => ({ id: f.id, type: f.type, title: f.title, snippet: f.snippet }));
    return { facts };
  },
});

register({
  name: "reserve",
  schema: {},
  async run(args, ctx) {
    ctx.emit?.("reserve", { key: args.key, amount: args.amount });
    return { reserved: args.amount };
  },
});

register({
  name: "schedule",
  schema: {},
  async run(args, ctx) {
    ctx.emit?.("schedule", { at: args.at, payload: args.payload });
    return { scheduled: args.at };
  },
});

register({
  name: "add_event",
  schema: {},
  async run(args, ctx) {
    const { phone, title, start, end, facility_id, ministry, description } = args;
    if (!phone) throw new Error('phone required');
    if (!title) throw new Error('title required');
    const evt = churchInfo.addEvent({ title, start, end, facility_id, ministry, description }, phone);
    ctx.emit?.('add_event', { event_id: evt.id, status: evt.status });
    return { event_id: evt.id, status: evt.status };
  }
});

register({
  name: "add_facility",
  schema: {},
  async run(args, ctx) {
    const { phone, name, capacity, location, rooms, notes } = args;
    if (!phone || !name) throw new Error('phone & name required');
    const fac = churchInfo.addFacility({ name, capacity, location, rooms, notes }, phone);
    ctx.emit?.('add_facility', { facility_id: fac.id });
    return { facility_id: fac.id };
  }
});

register({
  name: "add_service",
  schema: {},
  async run(args, ctx) {
    const { phone, campus, start, end, ministries_needed } = args;
    if (!phone || !campus || !start || !end) throw new Error('phone, campus, start, end required');
    const svc = churchInfo.addService({ campus, start, end, ministries_needed }, phone);
    ctx.emit?.('add_service', { service_id: svc.id });
    return { service_id: svc.id };
  }
});

register({
  name: "add_announcement",
  schema: {},
  async run(args, ctx) {
    const { phone, title, body, publish_on } = args;
    if (!phone || !title || !body) throw new Error('phone, title, body required');
    const ann = churchInfo.addAnnouncement({ title, body, publish_on: publish_on || new Date().toISOString() }, phone);
    ctx.emit?.('add_announcement', { announcement_id: ann.id });
    return { announcement_id: ann.id };
  }
});

register({
  name: "update_event",
  schema: {},
  async run(args, ctx) {
    const { phone, event_id, patch } = args;
    if (!phone || !event_id || !patch) throw new Error('phone, event_id, patch required');
    const evt = churchInfo.updateEvent(event_id, patch, phone);
    ctx.emit?.('update_event', { event_id: evt.id });
    return { event_id: evt.id };
  }
});

register({
  name: "cancel_event",
  schema: {},
  async run(args, ctx) {
    const { phone, event_id, reason } = args;
    if (!phone || !event_id) throw new Error('phone, event_id required');
    const evt = churchInfo.cancelEvent(event_id, phone, reason);
    ctx.emit?.('cancel_event', { event_id: evt.id });
    return { event_id: evt.id };
  }
});

register({
  name: "list_events",
  schema: {},
  async run(args) {
    const { ministry, from, to, status } = args || {};
    const evts = churchInfo.filterEvents({ ministry, from, to, status });
    return { events: evts };
  }
});

register({
  name: "list_facilities",
  schema: {},
  async run() {
    return { facilities: churchInfo.listFacilities() };
  }
});

register({
  name: "list_services",
  schema: {},
  async run(args) {
    const { campus, from, to } = args || {};
    return { services: churchInfo.filterServices({ campus, from, to }) };
  }
});
