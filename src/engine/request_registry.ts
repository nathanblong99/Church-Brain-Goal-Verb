import { canonicalFillKey } from './resource_key.js';
import { logEvent } from './events.js';

export type RequestStatus = 'open'|'partially_filled'|'filled'|'overfill'|'closed';

export interface VolunteerFillRequest {
  id: string;
  resource_key: string;
  role: string;
  time: string; // ISO
  event_id?: string;
  campus?: string;
  target_count: number;
  accepted_count: number;
  watchers: string[];
  status: RequestStatus;
  created_at: string;
  updated_at: string;
  history: Array<{ ts: string; actor: string; action: 'created'|'joined'|'target_changed'; from?: number; to?: number }>;
  pending_release?: { requested_target: number; excess: number; actor: string; ts: string };
}

const byId = new Map<string, VolunteerFillRequest>();
const byResource = new Map<string,string>();
let seq = 1;

export function canonicalKeyFromParts(parts: { role: string; time: string; event_id?: string; campus?: string; }) {
  return canonicalFillKey(parts);
}

export function getRequestByResource(key: string) {
  const id = byResource.get(key);
  return id ? byId.get(id) : undefined;
}

export function listActiveRequests() {
  return Array.from(byId.values()).filter(r => r.status !== 'closed');
}

export function ensureFillRequest(params: { role: string; time: string; event_id?: string; campus?: string; target_increment: number; requester_phone: string; }) {
  const resource_key = canonicalFillKey(params);
  let existing = getRequestByResource(resource_key);
  const now = new Date().toISOString();
  if (!existing) {
    existing = {
      id: `vr_${seq++}`,
      resource_key,
      role: params.role,
      time: params.time,
      event_id: params.event_id,
      campus: params.campus,
      target_count: params.target_increment,
      accepted_count: 0,
      watchers: [params.requester_phone],
      status: 'open',
      created_at: now,
      updated_at: now,
      history: [{ ts: now, actor: params.requester_phone, action: 'created', to: params.target_increment }]
    };
    byId.set(existing.id, existing);
    byResource.set(resource_key, existing.id);
    logEvent('request.created', { id: existing.id, resource_key, target: existing.target_count });
    return { request: existing, created: true };
  }
  // join / increment
  if (!existing.watchers.includes(params.requester_phone)) {
    existing.watchers.push(params.requester_phone);
    existing.history.push({ ts: now, actor: params.requester_phone, action: 'joined' });
  }
  if (params.target_increment > 0) {
    const from = existing.target_count;
    existing.target_count += params.target_increment;
    existing.history.push({ ts: now, actor: params.requester_phone, action: 'target_changed', from, to: existing.target_count });
    logEvent('request.target_raised', { id: existing.id, from, to: existing.target_count });
  } else {
    logEvent('request.joined', { id: existing.id });
  }
  existing.updated_at = now;
  updateStatus(existing);
  return { request: existing, created: false };
}

export function adjustTarget(resource_key: string, newTarget: number, actor: string) {
  const req = getRequestByResource(resource_key);
  if (!req) return { error: 'not_found' };
  if (newTarget <= 0) return { error: 'invalid_target' };
  const prev = req.target_count;
  if (newTarget < req.accepted_count) {
    const excess = req.accepted_count - newTarget;
    req.pending_release = { requested_target: newTarget, excess, actor, ts: new Date().toISOString() };
    logEvent('request.target_reduction_proposed', { id: req.id, from: prev, to: newTarget, excess, actor });
    return { proposed: true, request: req };
  }
  if (newTarget === prev) return { unchanged: true, request: req };
  req.target_count = newTarget;
  req.updated_at = new Date().toISOString();
  req.history.push({ ts: req.updated_at, actor, action: 'target_changed', from: prev, to: newTarget });
  updateStatus(req);
  logEvent('request.target_changed', { id: req.id, from: prev, to: newTarget, actor });
  return { request: req, changed: true };
}

export function finalizeRelease(resource_key: string, mode: 'keep'|'release', actor: string, releaseFn: (volunteer_id: string, role: string) => void){
  const req = getRequestByResource(resource_key);
  if (!req) return { error: 'not_found' };
  if (!req.pending_release) return { error: 'no_pending' };
  const pending = req.pending_release;
  if (mode === 'keep') {
    // Keep everyone: set target to accepted_count
    const prev = req.target_count;
    req.target_count = req.accepted_count;
    req.history.push({ ts: new Date().toISOString(), actor, action: 'target_changed', from: prev, to: req.target_count });
    req.pending_release = undefined;
    updateStatus(req);
    logEvent('request.target_reduction_kept_all', { id: req.id, accepted: req.accepted_count, target: req.target_count, actor });
    return { kept: true, request: req };
  }
  // release path
  const toRelease = pending.excess;
  // We rely on external iteration to choose which volunteers; for now no selection logic (placeholder)
  // Caller should gather most recent accepted volunteers externally and invoke releaseFn for each.
  req.accepted_count -= toRelease; // after releasing
  const prev = req.target_count;
  req.target_count = pending.requested_target;
  req.history.push({ ts: new Date().toISOString(), actor, action: 'target_changed', from: prev, to: req.target_count });
  req.pending_release = undefined;
  updateStatus(req);
  logEvent('request.target_reduced_final', { id: req.id, target: req.target_count, actor, released: toRelease });
  return { released: toRelease, request: req };
}

export function incrementAccepted(resource_key: string, delta = 1) {
  const req = getRequestByResource(resource_key);
  if (!req) return;
  req.accepted_count += delta;
  req.updated_at = new Date().toISOString();
  updateStatus(req);
  logEvent('request.progress', { id: req.id, accepted: req.accepted_count, target: req.target_count, status: req.status });
}

function updateStatus(r: VolunteerFillRequest) {
  if (r.status === 'overfill') return;
  if (r.accepted_count >= r.target_count) r.status = 'filled';
  else if (r.accepted_count > 0) r.status = 'partially_filled';
  else r.status = 'open';
}