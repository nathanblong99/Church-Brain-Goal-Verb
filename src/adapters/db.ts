import { Assignment, Offer } from '../models/types.js';

// In-memory dev store (replace with persistent DB later)
const offers: Offer[] = [];
const assignments: Assignment[] = [];
interface MessageRecord { key: string; to: string; template: string; body: string; sent_at: string; }
const messages: MessageRecord[] = [];

export const db = {
  createOffer(o: Offer) { offers.push(o); return o; },
  getOffersForRequest(request_id: string) { return offers.filter(o => o.request_id === request_id); },
  getActiveOffer(request_id: string, volunteer_id: string, ministry?: string) {
    return offers.find(o => o.request_id === request_id && o.volunteer_id === volunteer_id && (!ministry || o.ministry === ministry));
  },
  createAssignment(a: Assignment) { assignments.push(a); return a; },
  getAssignments(request_id: string) { return assignments.filter(a => a.request_id === request_id); },
  updateAssignmentState(request_id: string, volunteer_id: string, ministry: string, state: Assignment['state']) {
    const a = assignments.find(x => x.request_id === request_id && x.volunteer_id === volunteer_id && x.ministry === ministry);
    if (a) { a.state = state; a.updated_at = new Date().toISOString(); }
    return a;
  },
  recordMessage(rec: MessageRecord) { messages.push(rec); },
  hasMessageKey(key: string) { return messages.some(m => m.key === key); },
  getMessagesTo(volunteer_id: string) { return messages.filter(m => m.to === volunteer_id); },
};
