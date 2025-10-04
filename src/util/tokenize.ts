const STOP = new Set([
  'the','and','for','what','who','when','why','how','is','are','about','this','that','with','you','can','please','hi','hey','hello','we','our','your','a','an','of','to','in'
]);

export function tokenize(q: string, max = 8): string[] {
  return q.toLowerCase()
    .replace(/[^a-z0-9\s]/g,' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w))
    .slice(0, max);
}
