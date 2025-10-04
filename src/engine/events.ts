import { EventLogEntry } from '../models/types.js';

const events: EventLogEntry[] = [];

export function logEvent(type: string, payload: any, correlation_id?: string) {
  events.push({ id: `${Date.now()}-${events.length}`, ts: new Date().toISOString(), type, correlation_id, payload });
}

export function getEvents(filter?: { type?: string }) {
  if (!filter) return [...events];
  return events.filter(e => (filter.type ? e.type === filter.type : true));
}
