export type Ministry = "nursery" | "children" | string;

export type VolunteerRequestStatus =
  | "draft"
  | "open"
  | "partially_filled"
  | "filled"
  | "closed"
  | "cancelled";

export interface VolunteerRequest {
  id: string;
  service_time: string; // ISO
  targets: Record<Ministry, number>;
  status: VolunteerRequestStatus;
  version: number;
}

export type Goal =
  | { kind: "FillRole"; role: Ministry; count: number; time: string }
  | { kind: "RebalanceTargets"; targets: Record<Ministry, number>; time: string }
  | { kind: "CancelRequest"; request_id: string };

export interface PlanStep {
  call: string;
  args?: any;
  out?: string;
  foreach?: string; // e.g. "person in accepted"
}

export interface Plan {
  goal: Goal;
  method: string;
  steps: PlanStep[];
  success_when: string[];
}

export interface Assignment {
  request_id: string;
  volunteer_id: string;
  ministry: Ministry;
  state: "invited" | "accepted" | "declined" | "waitlisted" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface Offer {
  request_id: string;
  volunteer_id: string;
  ministry: Ministry;
  expires_at: string; // ISO
  created_at: string;
}

export interface EventLogEntry {
  id: string;
  ts: string;
  type: string;
  correlation_id?: string;
  payload: any;
}
