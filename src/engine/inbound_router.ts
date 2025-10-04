import { db } from '../adapters/db.js';
import { getVerb } from '../verbs/index.js';
import { generateReply } from '../agent/response_generator.js';
import { classifyInbound } from '../agent/classifier.js';
import { logEvent } from './events.js';
import { listEvents } from '../adapters/church_info_db.js';
import { ensureFillRequest, getRequestByResource, adjustTarget, canonicalKeyFromParts, finalizeRelease, listActiveRequests } from './request_registry.js';
import { getPendingAddEvent, setPendingAddEvent, clearPendingAddEvent } from './inbound_state.js';

export interface InboundMessage { from: string; body: string; received_at?: string; }

export interface InboundResult { kind: string; details?: any; reply?: string; }

function normalize(body: string){ return body.trim(); }
function isYes(b: string){ return /^(yes|y)$/i.test(b); }
function isNo(b: string){ return /^(no|n)$/i.test(b); }

export async function handleInbound(msg: InboundMessage): Promise<InboundResult> {
  const body = normalize(msg.body);
  // Multi-turn continuation check: if we have pending add_event, attempt merge before offer logic.
  const pending = getPendingAddEvent(msg.from);
  // naive: find any active offer for pseudo request 'REQ'
  const offer = db.getOffersForRequest('REQ').find(o => o.volunteer_id === msg.from);
  if (offer) {
    if (isYes(body)) {
      const assign = getVerb('assign');
      await assign.run({ request_id: offer.request_id, person: offer.volunteer_id, role: offer.ministry }, { now: () => new Date(), emit: () => {}, env: {} });
      let reply: string | undefined;
      try {
        reply = await generateReply({
          kind: 'offer.accepted',
          requiredPhrases: ['Thank you'],
          context: { role: offer.ministry, request_id: offer.request_id }
        });
      } catch {
        reply = 'Thank you for confirming your spot.'; // fallback canned if model unavailable
      }
      return { kind: 'offer.accepted', details: { volunteer: offer.volunteer_id, ministry: offer.ministry }, reply };
    }
    if (isNo(body)) {
      let reply: string | undefined;
      try {
        reply = await generateReply({
          kind: 'offer.declined',
          requiredPhrases: ['Got it'],
          context: { role: offer.ministry }
        });
      } catch {
        reply = 'Got it—thanks for letting us know.';
      }
      return { kind: 'offer.declined', details: { volunteer: offer.volunteer_id, ministry: offer.ministry }, reply };
    }
  }
  // Generic classification path
  try {
    const ci = await classifyInbound(body, msg.from);
    logEvent('intent.classified', { intent: ci.intent, confidence: ci.confidence });
    if (ci.intent === 'ask_status') {
      // trivial sample: report count of upcoming events
      const eventsCount = listEvents().length;
      let reply: string | undefined;
      try { reply = await generateReply({ kind: 'ask_status', context: { eventsCount }, requiredPhrases: ['events'] }); } catch { reply = `We have ${eventsCount} events scheduled.`; }
      return { kind: 'ask_status', details: { eventsCount }, reply };
    }
    if (ci.intent === 'fill_role_request') {
      const s = ci.slots || {};
      if (!s.role || !s.count || !s.time) {
        let reply: string | undefined;
        try { reply = await generateReply({ kind: 'clarify.fill_role', context: { missing: ['role','count','time'].filter(k=>!s[k]) }, requiredPhrases: ['need'] }); } catch { reply = 'Need role, count, time.'; }
        return { kind: 'fill_role.pending', details: { missing: ['role','count','time'].filter(k=>!s[k]) }, reply };
      }
      const ensure = ensureFillRequest({ role: s.role, time: s.time, event_id: s.event_id, campus: s.campus, target_increment: s.count, requester_phone: msg.from });
      if (!ensure.created) {
        const rk = canonicalKeyFromParts({ role: s.role, time: s.time, event_id: s.event_id, campus: s.campus });
        const existing = getRequestByResource(rk)!;
        const reply = await generateReply({ kind: 'fill_role.joined', context: { accepted: existing.accepted_count, target: existing.target_count, role: existing.role }, requiredPhrases: ['Already active'] }).catch(()=>`Already active: ${existing.accepted_count}/${existing.target_count}.`);
        return { kind: 'fill_role.joined', details: { request_id: existing.id }, reply };
      }
      const reply = await generateReply({ kind: 'fill_role.created', context: { target: ensure.request.target_count, role: ensure.request.role }, requiredPhrases: ['Search started'] }).catch(()=>`Search started for ${ensure.request.role}: need ${ensure.request.target_count}.`);
      return { kind: 'fill_role.created', details: { request_id: ensure.request.id }, reply };
    }
    if (ci.intent === 'staff_reduce_target') {
      const s = ci.slots || {};
      if (!s.role || !s.new_target || !s.time) {
        const reply = 'Need role, new_target, and time to adjust target.';
        return { kind: 'fill_role.reduce.pending', details: { missing: ['role','new_target','time'].filter(k=>!s[k]) }, reply };
      }
      const rk = canonicalKeyFromParts({ role: s.role, time: s.time, event_id: s.event_id, campus: s.campus });
      const existing = getRequestByResource(rk);
      if (!existing) {
        const reply = 'No existing request to reduce.';
        return { kind: 'fill_role.reduce.no_request', details: {}, reply };
      }
      const adj = adjustTarget(rk, Number(s.new_target), msg.from);
      if ((adj as any).proposed) {
        const req = (adj as any).request;
        const excess = req.pending_release!.excess;
        let reply: string;
        try {
          reply = await generateReply({ kind: 'fill_role.reduce.proposed', context: { accepted: req.accepted_count, requested: req.pending_release!.requested_target, excess }, requiredPhrases: ['keep','release'] });
        } catch {
          reply = `We already have ${req.accepted_count} committed but you’re proposing ${req.pending_release!.requested_target}. Would you like to keep everyone this time or should I politely let about ${excess} know they can sit this one out and encourage them for future opportunities? Just tell me in natural language.`;
        }
        return { kind: 'fill_role.reduce.proposed', details: { request_id: req.id, excess }, reply };
      }
      if ((adj as any).changed) {
        const req = (adj as any).request;
        const reply = await generateReply({ kind: 'fill_role.reduce.applied', context: { target: req.target_count, accepted: req.accepted_count }, requiredPhrases: ['Target updated'] }).catch(()=>`Target updated to ${req.target_count}.`);
        return { kind: 'fill_role.reduce.applied', details: { request_id: req.id }, reply };
      }
      return { kind: 'fill_role.reduce.unchanged', details: {}, reply: 'Target unchanged.' };
    }
    if (ci.intent === 'staff_keep_all' || ci.intent === 'staff_release_excess') {
      const pending = listActiveRequests().find(r => r.pending_release && r.watchers.includes(msg.from));
      if (!pending) {
        return { kind: 'fill_role.reduce.none', details: {}, reply: 'No pending reduction.' };
      }
      if (ci.intent === 'staff_keep_all') {
        const res = finalizeRelease(pending.resource_key, 'keep', msg.from, ()=>{});
        if ((res as any).error) {
          return { kind: 'fill_role.reduce.error', details: { error: (res as any).error }, reply: 'Unable to finalize keep.' };
        }
        const req = (res as any).request!;
        const reply = await generateReply({ kind: 'fill_role.reduce.keep', context: { target: req.target_count, accepted: req.accepted_count }, requiredPhrases: ['kept'] }).catch(()=>`Kept all ${req.accepted_count}. Target now ${req.target_count}.`);
        return { kind: 'fill_role.reduce.keep', details: { request_id: pending.id }, reply };
      } else {
        // release extras: choose LIFO from assignments
        const assignList = db.getAssignments('REQ').filter(a=> a.ministry === pending.role && a.state === 'accepted');
        // Just take last N (excess)
        const excess = pending.pending_release!.excess;
        const toRelease = assignList.slice(-excess);
        toRelease.forEach(a=> db.updateAssignmentState(a.request_id, a.volunteer_id, a.ministry, 'cancelled'));
        const res = finalizeRelease(pending.resource_key, 'release', msg.from, ()=>{});
        if ((res as any).error) {
          return { kind: 'fill_role.reduce.error', details: { error: (res as any).error }, reply: 'Unable to finalize release.' };
        }
        const req = (res as any).request!;
        const reply = await generateReply({ kind: 'fill_role.reduce.release', context: { released: excess, remaining: req.accepted_count, target: req.target_count }, requiredPhrases: ['released'] }).catch(()=>`Released ${excess}. Now ${req.accepted_count}/${req.target_count}.`);
        return { kind: 'fill_role.reduce.release', details: { request_id: pending.id, released: excess }, reply };
      }
    }
    if (ci.intent === 'unknown') {
      let reply: string | undefined;
      try { reply = await generateReply({ kind: 'clarify', context: { original: body }, requiredPhrases: ['clarify'] }); } catch { reply = 'Could you clarify what you need?'; }
      return { kind: 'unhandled', details: { body }, reply };
    }
  if (ci.intent === 'staff_add_event' || pending) {
      // Extract slots: title, start, end, facility_name, ministry, description
      const slots = { ...(pending?.slots||{}), ...(ci.slots||{}) };
      // Heuristic: if title present, try recurrence inference for missing fields
      if (slots.title) {
        const existing = listEvents().filter(e => e.title.toLowerCase() === String(slots.title).toLowerCase());
        if (existing.length >= 2) {
          const last = existing.slice(-1)[0];
          if (last.start && last.end) {
            const prevDuration = (new Date(last.end).getTime() - new Date(last.start).getTime());
            if (!slots.facility_id && last.facility_id) slots.facility_id = last.facility_id;
            if (!slots.ministry && last.ministry) slots.ministry = last.ministry;
            if (slots.start && !slots.end) {
              try { const startMs = new Date(slots.start).getTime(); if (!isNaN(startMs)) slots.end = new Date(startMs + prevDuration).toISOString(); } catch {}
            }
          }
        }
      }
      const missing: string[] = [];
      if (!slots.title) missing.push('title');
      if (!slots.start) missing.push('start (date/time)');
      if (!slots.end) missing.push('end (date/time)');
      // facility_id not strictly required; ministry optional
      // Create or update draft when missing required fields
      if (missing.length) {
        let draftId = pending?.draft_event_id;
        if (!draftId) {
          // create draft event now (so partial data is persisted)
            try {
              const addEvent = getVerb('add_event');
              const created = await addEvent.run({ phone: msg.from, title: slots.title || '(Untitled)', start: slots.start, end: slots.end, facility_id: slots.facility_id, ministry: slots.ministry, description: slots.description }, { now: () => new Date(), emit: () => {}, env: {} });
              draftId = created.event_id;
            } catch {/* ignore draft creation failure */}
        }
        setPendingAddEvent(msg.from, slots, draftId);
        let reply: string | undefined;
        try {
          reply = await generateReply({ kind: 'clarify.add_event', context: { missing, draft_event_id: draftId }, requiredPhrases: ['need'] });
        } catch { reply = 'I need: ' + missing.join(', ') + '.'; }
        return { kind: 'staff_add_event.pending', details: { missing, draft_event_id: draftId }, reply };
      }
      // Try to resolve facility_name to facility_id
      let facility_id = slots.facility_id;
      if (!facility_id && slots.facility_name) {
        const facilities = require('../adapters/church_info_db.js').listFacilities();
        const match = facilities.find((f: any) => f.name.toLowerCase().includes(slots.facility_name.toLowerCase()));
        if (match) facility_id = match.id;
      }
      // Compose args for add_event verb
      const addEvent = getVerb('add_event');
      let eventResult, reply;
      try {
        // If we already have a draft event id, patch it instead of creating new
        if (pending?.draft_event_id) {
          const update = getVerb('update_event');
          await update.run({ phone: msg.from, event_id: pending.draft_event_id, patch: { title: slots.title, start: slots.start, end: slots.end, facility_id, ministry: slots.ministry, description: slots.description } }, { now: () => new Date(), emit: () => {}, env: {} });
          eventResult = { event_id: pending.draft_event_id };
        } else {
          eventResult = await addEvent.run({
            phone: msg.from,
            title: slots.title,
            start: slots.start,
            end: slots.end,
            facility_id,
            ministry: slots.ministry,
            description: slots.description
          }, { now: () => new Date(), emit: () => {}, env: {} });
        }
        try {
          reply = await generateReply({
            kind: 'staff_add_event',
            context: { ...slots, facility_id, event_id: eventResult.event_id },
            requiredPhrases: ['event scheduled']
          });
        } catch {
          reply = `Event scheduled: ${slots.title || 'Event'} (${eventResult.event_id})`;
        }
        clearPendingAddEvent(msg.from);
        return { kind: 'staff_add_event', details: { event_id: eventResult.event_id }, reply };
      } catch (err: any) {
        reply = 'Could not schedule event. Please check details or try again.';
        return { kind: 'staff_add_event.failed', details: { error: err?.message }, reply };
      }
    }
  } catch {
    // swallow classification errors
  }
  return { kind: 'unhandled', details: { body } };
}
