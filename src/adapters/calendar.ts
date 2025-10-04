import * as churchInfo from './church_info_db.js';

export interface ServiceFilter { campus?: string; from?: string; to?: string; limit?: number; }

export function listServices(filter: ServiceFilter = {}) {
  const { campus, from, to, limit } = filter;
  let services = churchInfo.filterServices({ campus, from, to });
  services = services.sort((a,b)=> (a.start||'').localeCompare(b.start||''));
  if (limit && limit > 0) services = services.slice(0, limit);
  return services.map(s => ({
    id: s.id,
    campus: s.campus,
    start: s.start,
    end: s.end,
    duration_min: s.start && s.end ? Math.round((new Date(s.end).getTime()-new Date(s.start).getTime())/60000) : undefined
  }));
}

export function lookupByDate(dateIso: string, campus?: string) {
  const dayStart = new Date(dateIso);
  if (isNaN(dayStart.getTime())) return [];
  const day = dayStart.toISOString().slice(0,10); // YYYY-MM-DD
  const nextDay = new Date(dayStart.getTime()+24*3600*1000).toISOString().slice(0,10);
  const from = day + 'T00:00:00.000Z';
  const to = nextDay + 'T00:00:00.000Z';
  return listServices({ campus, from, to });
}
