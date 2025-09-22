export type StackLayoutConfig = {
  width?: string;
  height?: string;
};

const PX_PATTERN = /^\s*(\d+)(px)?\s*$/i;

export function normalizePixelValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.max(0, Math.round(value));
    return `${normalized}px`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(PX_PATTERN);
    if (match) {
      const amount = match[1];
      return `${amount}px`;
    }
  }
  return null;
}

export function sanitizeStackConfig(input: any): StackLayoutConfig | undefined {
  if (!input || typeof input !== "object") return undefined;
  const normalized: StackLayoutConfig = {};

  const width = normalizePixelValue((input as any).width);
  if (width) normalized.width = width;

  const height = normalizePixelValue((input as any).height);
  if (height) normalized.height = height;

  return Object.keys(normalized).length ? normalized : undefined;
}
