// Schema & helpers for intent classification output.
export interface ClassifiedIntent {
  intent: string;
  confidence: number;
  slots: Record<string, any>;
}

export const INTENT_LIST = [
  'volunteer_accept','volunteer_decline','volunteer_unavailable',
  'staff_add_event','staff_update_event','staff_cancel_event','staff_list_events','staff_list_services',
  'fill_role_request','staff_reduce_target','staff_release_excess','staff_keep_all','ask_status','unknown'
];

export function validateIntent(obj: any): obj is ClassifiedIntent {
  return obj && typeof obj.intent === 'string' && typeof obj.confidence === 'number' && obj.slots && typeof obj.slots === 'object';
}
