// Local persistent church information database.
// Provides facilities, events, services, announcements, with simple search.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as peopleDb from './people_db.js';

export interface Facility { id: string; name: string; capacity?: number; location?: string; rooms?: string[]; notes?: string; }
export interface Event { id: string; title: string; description?: string; start?: string; end?: string; facility_id?: string; ministry?: string; status: 'draft' | 'scheduled' | 'cancelled' | 'completed'; created_by: string; created_at: string; }
export interface Service { id: string; campus: string; start: string; end: string; ministries_needed?: Record<string, number>; }
export interface Announcement { id: string; title: string; body: string; publish_on: string; created_by: string; }

interface ChurchInfoData {
  version: number;
  updated_at: string;
  facilities: Facility[];
  events: Event[];
  services: Service[];
  announcements: Announcement[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataFile = join(__dirname, '..', '..', 'data', 'church_info.json');

let cache: ChurchInfoData | null = null;

function nowIso() { return new Date().toISOString(); }

export function load(): ChurchInfoData {
  if (cache) return cache;
  if (!existsSync(dataFile)) {
    cache = { version: 1, updated_at: nowIso(), facilities: [], events: [], services: [], announcements: [] };
    save();
  } else {
    cache = JSON.parse(readFileSync(dataFile, 'utf-8')) as ChurchInfoData;
  }
  return cache!;
}

function save() {
  if (!cache) return;
  cache.updated_at = nowIso();
  writeFileSync(dataFile, JSON.stringify(cache, null, 2));
}

function staffPhones(): Set<string> {
  return new Set(peopleDb.all().filter(p => p.kind === 'staff').map(p => p.phone));
}

function assertStaff(phone: string) {
  const set = staffPhones();
  if (!set.has(phone)) throw new Error('UNAUTHORIZED: phone not recognized as staff');
}

export function listFacilities() { return load().facilities; }
export function listEvents() { return load().events; }
export function listServices() { return load().services; }
export function listAnnouncements() { return load().announcements; }

export function addFacility(input: Omit<Facility, 'id'> & { id?: string }, staffPhone: string): Facility {
  assertStaff(staffPhone);
  const db = load();
  const id = input.id || `fac_${db.facilities.length + 1}`;
  const facility: Facility = { id, name: input.name, capacity: input.capacity, location: input.location, rooms: input.rooms, notes: input.notes };
  db.facilities.push(facility);
  save();
  return facility;
}

export function addEvent(input: Omit<Event, 'id' | 'status' | 'created_at' | 'created_by'> & { id?: string }, staffPhone: string): Event {
  assertStaff(staffPhone);
  const db = load();
  const id = input.id || `evt_${db.events.length + 1}`;
  const complete = !!(input.start && input.end);
  const event: Event = { id, title: input.title, description: input.description, start: input.start, end: input.end, facility_id: input.facility_id, ministry: input.ministry, status: complete ? 'scheduled' : 'draft', created_by: staffPhone, created_at: nowIso() };
  db.events.push(event);
  save();
  return event;
}

export function updateEvent(event_id: string, patch: Partial<Pick<Event, 'title' | 'description' | 'start' | 'end' | 'facility_id' | 'ministry' | 'status'>>, staffPhone: string): Event {
  assertStaff(staffPhone);
  const db = load();
  const evt = db.events.find(e => e.id === event_id);
  if (!evt) throw new Error('EVENT_NOT_FOUND');
  Object.assign(evt, patch);
  if (evt.status === 'draft' && evt.start && evt.end) {
    // auto-promote
    evt.status = 'scheduled';
  }
  save();
  return evt;
}

export function cancelEvent(event_id: string, staffPhone: string, reason?: string): Event {
  return updateEvent(event_id, { status: 'cancelled', description: reason ? `${reason}` : undefined }, staffPhone);
}

export function addService(input: Omit<Service, 'id'> & { id?: string }, staffPhone: string): Service {
  assertStaff(staffPhone);
  const db = load();
  const id = input.id || `svc_${db.services.length + 1}`;
  const service: Service = { id, campus: input.campus, start: input.start, end: input.end, ministries_needed: input.ministries_needed };
  db.services.push(service);
  save();
  return service;
}

export function addAnnouncement(input: Omit<Announcement, 'id' | 'created_by'> & { id?: string }, staffPhone: string): Announcement {
  assertStaff(staffPhone);
  const db = load();
  const id = input.id || `ann_${db.announcements.length + 1}`;
  const ann: Announcement = { id, title: input.title, body: input.body, publish_on: input.publish_on, created_by: staffPhone };
  db.announcements.push(ann);
  save();
  return ann;
}

export interface Fact { id: string; type: string; title: string; snippet: string; }

export function searchFacts(query: string): Fact[] {
  const q = query.toLowerCase();
  const db = load();
  const facts: Fact[] = [];
  for (const f of db.facilities) {
    if ([f.name, f.location, f.notes].some(v => v && v.toLowerCase().includes(q))) {
      facts.push({ id: f.id, type: 'facility', title: f.name, snippet: `Facility ${f.name}${f.location ? ' @ '+f.location : ''}` });
    }
  }
  for (const e of db.events) {
    if ([e.title, e.description, e.ministry].some(v => v && v.toLowerCase().includes(q))) {
      facts.push({ id: e.id, type: 'event', title: e.title, snippet: `${e.title} on ${e.start}` });
    }
  }
  for (const s of db.services) {
    const label = `${s.campus} service ${s.start}`;
    if (label.toLowerCase().includes(q)) facts.push({ id: s.id, type: 'service', title: label, snippet: label });
  }
  return facts.slice(0, 25);
}

// Filter utilities for verbs
export function filterEvents(filter: { ministry?: string; from?: string; to?: string; status?: string }) {
  let evts = listEvents();
  if (filter.ministry) evts = evts.filter(e => e.ministry === filter.ministry);
  if (filter.status) evts = evts.filter(e => e.status === filter.status);
  if (filter.from) evts = evts.filter(e => e.start ? e.start >= filter.from! : false);
  if (filter.to) evts = evts.filter(e => e.start ? e.start <= filter.to! : false);
  return evts;
}

export function filterServices(filter: { campus?: string; from?: string; to?: string }) {
  let svcs = listServices();
  if (filter.campus) svcs = svcs.filter(s => s.campus === filter.campus);
  if (filter.from) svcs = svcs.filter(s => s.start >= filter.from!);
  if (filter.to) svcs = svcs.filter(s => s.start <= filter.to!);
  return svcs;
}

export function dataPath() { return dataFile; }
