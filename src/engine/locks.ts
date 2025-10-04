// Simple in-memory lock map (dev/demo). Replace with Redis / DB advisory lock in production.
const locks = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Chain onto existing promise if lock held
  const prev = locks.get(key) || Promise.resolve();
  let release: (value: unknown) => void;
  const p = new Promise(r => (release = r));
  locks.set(key, prev.then(() => p));
  try {
    const result = await fn();
    return result;
  } finally {
    release!(undefined);
    // After chain resolves, if this promise is the tail, delete
    prev
      .then(() => p)
      .then(() => {
        if (locks.get(key) === p) locks.delete(key);
      })
      .catch(() => {});
  }
}
