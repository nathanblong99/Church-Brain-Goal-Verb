export interface FillGoalLike { role: string; time: string; event_id?: string; campus?: string; }
export function canonicalFillKey(g: FillGoalLike) {
  const campus = (g.campus || 'default').toLowerCase();
  const role = (g.role).toLowerCase();
  const evt = g.event_id ? `evt:${g.event_id}` : 'evt:unknown';
  const time = new Date(g.time).toISOString();
  return `${evt}|role:${role}|time:${time}|campus:${campus}`;
}