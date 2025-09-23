export function isLikelyStableId(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value) || value.startsWith('naddr1') || value.startsWith('note1');
}

export function extractStableId(value: any, seen: WeakSet<object> = new WeakSet()): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return isLikelyStableId(value) ? value : null;
  if (typeof value !== 'object') return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const candidate = (value as any).id ?? (value as any).naddr ?? (value as any).event?.id;
  if (typeof candidate === 'string' && candidate.length > 0) return candidate;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractStableId(entry, seen);
      if (nested) return nested;
    }
  } else {
    for (const entry of Object.values(value)) {
      if (typeof entry === 'string') {
        if (isLikelyStableId(entry)) return entry;
      } else if (entry && typeof entry === 'object') {
        const nested = extractStableId(entry, seen);
        if (nested) return nested;
      }
    }
  }
  return null;
}

export function hashObject(value: any): string {
  try {
    const json = JSON.stringify(value);
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      hash = (hash * 31 + json.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  } catch {
    return '';
  }
}

export function deriveLoopKey(nodeId: string | undefined, item: any, index: number): string {
  const base = nodeId ? String(nodeId) : 'each';
  const stableId = extractStableId(item);
  if (stableId) return `${base}-${stableId}`;
  const hashed = hashObject(item);
  if (hashed) return `${base}-${hashed}`;
  return `${base}-idx-${index}`;
}
