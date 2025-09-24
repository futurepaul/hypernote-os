import type { CSSProperties } from "react";
import { interpolate as interp } from "../../interp/interpolate";
import { resolveReference, isReferenceExpression } from "../../interp/reference";
import { nip19 } from "nostr-tools";

export function interpolateText(text: string, globals: any, queries: Record<string, any>) {
  return interp(text, { globals, queries });
}

export function buildPayload(spec: any, globals: any, queries: Record<string, any>) {
  if (spec === undefined) return undefined;

  const scope = { globals, queries };

  const transform = (value: any): any => {
    if (typeof value === 'string') {
      if (value.includes('{{')) return interpolateText(value, globals, queries);
      const trimmed = value.trim();
      if (trimmed && isReferenceExpression(trimmed)) {
        const resolved = resolveReference(trimmed, scope);
        return resolved !== undefined ? resolved : value;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(transform);
    if (value && typeof value === 'object') {
      const inner: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) inner[k] = transform(v);
      return inner;
    }
    return value;
  };

  return transform(spec);
}

export function stackStyleFromData(data: any): CSSProperties | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const style: CSSProperties = {};
  if (typeof data.width === 'string' && data.width.length) style.width = data.width;
  if (typeof data.height === 'string' && data.height.length) style.height = data.height;
  if (typeof data.gap === 'string' && data.gap.length) style.gap = data.gap;
  if (typeof data.gap === 'number' && Number.isFinite(data.gap)) style.gap = `${data.gap}px`;
  if (data.wrap) style.flexWrap = 'wrap';
  if (typeof data.align === 'string' && data.align.length) style.alignItems = data.align;
  if (typeof data.justify === 'string' && data.justify.length) style.justifyContent = data.justify;
  return Object.keys(style).length ? style : undefined;
}

export function buildSwitchPayloadFromNostrUri(href: string): Record<string, any> | null {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed.toLowerCase().startsWith('nostr:')) return null;
  const value = trimmed.slice('nostr:'.length);
  if (!value) return null;
  try {
    const decoded = nip19.decode(value);
    switch (decoded.type) {
      case 'npub': {
        const pubkey = bytesOrStringToHex(decoded.data);
        if (!pubkey) return null;
        const payload = { kind: 0, pubkey, value: trimmed, uri: trimmed };
        console.log('[buildSwitchPayloadFromNostrUri] npub', payload);
        return payload;
      }
      case 'nprofile': {
        const data = decoded.data as { pubkey?: string; relays?: string[] };
        const pubkey = typeof data.pubkey === 'string' ? data.pubkey : null;
        if (!pubkey) return null;
        const payload = { kind: 0, pubkey, value: trimmed, uri: trimmed, relays: Array.isArray(data.relays) ? data.relays : undefined };
        console.log('[buildSwitchPayloadFromNostrUri] nprofile', payload);
        return payload;
      }
      case 'note': {
        const id = bytesOrStringToHex(decoded.data);
        if (!id) return null;
        const payload = { kind: 1, eventId: id, value: trimmed, uri: trimmed };
        console.log('[buildSwitchPayloadFromNostrUri] note', payload);
        return payload;
      }
      case 'nevent': {
        const data = decoded.data as { id: string; author?: string; kind?: number; relays?: string[] };

        if (!data?.id) return null;
        const payload = {
          kind: typeof data.kind === 'number' ? data.kind : 1,
          eventId: data.id,
          author: data.author,
          relays: Array.isArray(data.relays) ? data.relays : undefined,
          value: trimmed,
          uri: trimmed,
        };
        console.log('[buildSwitchPayloadFromNostrUri] nevent', payload);
        return payload;
      }
      case 'naddr': {
        const data = decoded.data as { identifier: string; kind: number; pubkey: string; relays?: string[] };
        if (!data || typeof data.kind !== 'number' || typeof data.pubkey !== 'string') return null;
        const payload = {
          kind: data.kind,
          identifier: data.identifier,
          pubkey: data.pubkey,
          naddr: value,
          value: trimmed,
          uri: trimmed,
          relays: Array.isArray(data.relays) ? data.relays : undefined,
        };
        console.log('[buildSwitchPayloadFromNostrUri] naddr', payload);
        return payload;
      }
      default:
        return null;
    }
  } catch (err) {
    console.warn('Failed to decode nostr link', err);
    return null;
  }
}

function bytesOrStringToHex(data: string | Uint8Array | undefined): string | null {
  if (!data) return null;
  if (typeof data === 'string') return data;
  return Array.from(data).map((b) => b.toString(16).padStart(2, '0')).join('');
}
