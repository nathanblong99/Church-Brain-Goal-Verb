const seen = new Set<string>();

export function msgKey(reqId: string, personId: string, kind: string) {
  return `msg:${reqId}:${personId}:${kind}`;
}

export function alreadySent(key: string): boolean {
  return seen.has(key);
}

export function recordSent(key: string) {
  seen.add(key);
}
