import { z } from 'zod';

// Core verb argument schemas (initial subset; expand iteratively)
export const searchPeopleSchema = z.object({
  filter: z.any().optional()
});

export const makeOffersSchema = z.object({
  people: z.array(z.string()).nonempty(),
  role: z.string().min(1),
  time: z.string().min(1),
  expires_at: z.string().optional(),
  request_id: z.string().optional()
});

export const assignSchema = z.object({
  person: z.string().min(1),
  role: z.string().min(1),
  time: z.string().min(1),
  request_id: z.string().optional()
});

export const notifySchema = z.object({
  targets: z.array(z.string()).min(1),
  template: z.string().min(1),
  vars: z.record(z.any()).optional(),
  request_id: z.string().optional()
});

export const broadcastSchema = z.object({
  people: z.array(z.string()).min(1),
  template: z.string().min(1),
  vars: z.record(z.any()).optional(),
  request_id: z.string().optional()
});

export const askSchema = z.object({
  person: z.string().min(1),
  question_template: z.string().min(1),
  vars: z.record(z.any()).optional(),
  request_id: z.string().optional()
});

export const updateRecordSchema = z.object({
  entity_id: z.string().min(1),
  patch: z.record(z.any())
});

export const addEventSchema = z.object({
  phone: z.string().min(1),
  title: z.string().min(1),
  start: z.string().optional(),
  end: z.string().optional(),
  facility_id: z.string().optional(),
  ministry: z.string().optional(),
  description: z.string().optional()
});

export const updateEventSchema = z.object({
  phone: z.string().min(1),
  event_id: z.string().min(1),
  patch: z.record(z.any())
});

export const cancelEventSchema = z.object({
  phone: z.string().min(1),
  event_id: z.string().min(1),
  reason: z.string().optional()
});

export const listEventsSchema = z.object({
  ministry: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.string().optional()
}).optional();

export const genericEmpty = z.object({}).optional();

export type VerbName = keyof typeof verbSchemas;

export const verbSchemas = {
  search_people: searchPeopleSchema,
  make_offers: makeOffersSchema,
  assign: assignSchema,
  notify: notifySchema,
  unassign: assignSchema.extend({ person: z.string().min(1) }),
  broadcast: broadcastSchema,
  ask: askSchema,
  update_record: updateRecordSchema,
  reserve: z.object({ key: z.string(), amount: z.number() }),
  schedule: z.object({ at: z.string(), payload: z.any() }),
  add_event: addEventSchema,
  update_event: updateEventSchema,
  cancel_event: cancelEventSchema,
  list_events: listEventsSchema,
  list_facilities: genericEmpty,
  list_services: z.object({ campus: z.string().optional(), from: z.string().optional(), to: z.string().optional() }).optional(),
  search_church_data: z.object({ query: z.string().optional(), limit: z.number().optional() })
};

export function validateVerbArgs(name: string, args: any) {
  const schema = (verbSchemas as any)[name];
  if (!schema) return args; // unknown or not yet migrated
  // Pre-normalization for make_offers flexible input shapes
  if (name === 'make_offers' && args) {
    if (args.people && !Array.isArray(args.people)) {
      // Case: nested object {people: [...]} accidentally passed
      if (Array.isArray(args.people?.people)) {
        args = { ...args, people: args.people.people };
      } else if (typeof args.people === 'string') {
        const raw = args.people.trim();
        let arr: string[] | null = null;
        if (raw.startsWith('[') && raw.endsWith(']')) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) arr = parsed.map(String);
          } catch { /* ignore */ }
        }
        if (!arr) {
          // Split comma-separated or empty -> filter blanks
            arr = raw.length ? raw.split(/[,\s]+/).map((s: string)=>s.trim()).filter(Boolean) : [];
        }
        args = { ...args, people: arr };
      }
    }
  }
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
  throw new Error(`Verb args invalid for ${name}: ${parsed.error.issues.map((i: any)=> i.path.join('.')+': '+i.message).join('; ')}`);
  }
  return parsed.data;
}
