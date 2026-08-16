export function generateVisitorId(): string {
  const now = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${now}_${rnd}`;
}

export function getVisitorId(storageKey: string): string {
  try {
    const stored = globalThis.localStorage?.getItem(storageKey);
    if (stored) return stored;
  } catch {
    // localStorage unavailable
  }
  const id = generateVisitorId();
  try {
    globalThis.localStorage?.setItem(storageKey, id);
  } catch {
    // localStorage unavailable
  }
  return id;
}
