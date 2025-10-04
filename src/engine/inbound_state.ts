// Simple in-memory state for multi-turn inbound interactions (non-persistent).
interface PendingAddEvent {
  slots: Record<string, any>;
  created_at: number;
  draft_event_id?: string;
}

const pendingAddEvent = new Map<string, PendingAddEvent>(); // key = phone

export function getPendingAddEvent(phone: string){
  const p = pendingAddEvent.get(phone);
  if (!p) return undefined;
  // expire after 10 minutes
  if (Date.now() - p.created_at > 10*60*1000) { pendingAddEvent.delete(phone); return undefined; }
  return p;
}

export function setPendingAddEvent(phone: string, slots: Record<string,any>, draft_event_id?: string){
  const existing = pendingAddEvent.get(phone);
  pendingAddEvent.set(phone, { slots, draft_event_id: draft_event_id || existing?.draft_event_id, created_at: Date.now() });
}

export function clearPendingAddEvent(phone: string){ pendingAddEvent.delete(phone); }