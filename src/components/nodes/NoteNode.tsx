import { useMemo, useCallback, type MouseEvent } from "react";
import { useAction } from "../../state/actions";
import { formatDateHelper } from "../../lib/datetime";
import { buildPayload, buildSwitchPayloadFromNostrUri } from "./utils";

const URL_REGEX = /(https?:\/\/[^\s]+|nostr:[^\s]+)/g;
const TRAILING_PUNCT = new Set(['.', ',', '!', '?', ':', ';', ')', ']', '"', '\'']);
const IMAGE_EXTENSIONS = /(\.png|\.jpe?g|\.gif|\.webp)$/i;
const VIDEO_EXTENSIONS = /(\.mp4|\.mov|\.m4v|\.webm)$/i;

type TokenizedLine = Array<{ type: 'text' | 'link'; value: string; href?: string; trailing?: string }>;

export function NoteNode({ data, globals, queries, windowId }: { data?: any; globals: any; queries: Record<string, any>; windowId: string }) {
  const eventSpec = data?.event ?? data?.source ?? data?.value ?? data?.note;
  const profileSpec = data?.profile;

  const event = useMemo(() => buildPayload(eventSpec, globals, queries), [eventSpec, globals, queries]);
  const profile = useMemo(() => buildPayload(profileSpec, globals, queries), [profileSpec, globals, queries]);

  const note = event && typeof event === 'object' ? event : null;
  const content = typeof note?.content === 'string' ? note.content : '';
  const pubkeyRaw = typeof note?.pubkey === 'string' ? note.pubkey : '';
  const pubkey = pubkeyRaw ? pubkeyRaw.toLowerCase() : '';
  const createdAt = note?.created_at;
  const activeFilter = typeof globals?.state?.filter_pubkey === 'string' && globals.state.filter_pubkey.trim()
    ? globals.state.filter_pubkey.trim().toLowerCase()
    : null;

  const name = useMemo(() => {
    if (profile && typeof profile === 'object') {
      const display = (profile as any)?.display_name || (profile as any)?.name;
      if (typeof display === 'string' && display.trim()) return display.trim();
    }
    if (typeof note?.author === 'string' && note.author.trim()) return note.author.trim();
    if (typeof pubkeyRaw === 'string' && pubkeyRaw.length > 8) {
      return `${pubkeyRaw.slice(0, 8)}…${pubkeyRaw.slice(-4)}`;
    }
    return pubkeyRaw || 'Unknown';
  }, [profile, note?.author, pubkeyRaw, note]);

  const avatarUrl = useMemo(() => {
    if (profile && typeof profile === 'object') {
      const raw = (profile as any)?.picture;
      if (typeof raw === 'string' && raw.trim()) return raw.trim();
    }
    return null;
  }, [profile]);

  const parsedContent = useMemo(() => tokenizeNoteContent(content), [content]);
  const switchApp = useAction('system.switch_app', windowId);

  const handleAuthorClick = useCallback(() => {
    if (!switchApp || !pubkeyRaw) return;
    switchApp({ kind: 0, pubkey: pubkeyRaw, value: pubkeyRaw }, { windowId, globals, queries }).catch(err => console.warn('switch_app failed', err));
  }, [switchApp, pubkeyRaw, windowId, globals, queries]);

  if (!note) return null;
  if (activeFilter && pubkey && activeFilter !== pubkey) return null;

  const showHeader = !!profile;
  const paragraphs = parsedContent.lines.map((line, idx) => {
    if (line.length === 1 && line[0]?.value === '') {
      return <div key={`gap-${idx}`} className="h-2" />;
    }
    return (
      <p key={`p-${idx}`} className="whitespace-pre-wrap break-words leading-relaxed text-[15px]">
        {line.map((token, tokenIdx) => {
          if (token.type === 'link' && token.href) {
            const { href } = token;
            if (!href) return <span key={`text-${idx}-${tokenIdx}`}>{token.value}</span>;
            const isNostr = href.startsWith('nostr:');
            const onClick = isNostr && switchApp ? (event: MouseEvent<HTMLAnchorElement>) => {
              event.preventDefault();
              const payload = buildSwitchPayloadFromNostrUri(href);
              if (payload) switchApp(payload, { windowId, globals, queries }).catch(err => console.warn('nostr link action failed', err));
            } : undefined;
            return (
              <a
                key={`link-${idx}-${tokenIdx}`}
                href={href}
                target={isNostr ? undefined : '_blank'}
                rel={isNostr ? undefined : 'noreferrer'}
                onClick={onClick}
                className="text-blue-600 hover:underline break-words"
              >
                {token.value}
              </a>
            );
          }
          return <span key={`text-${idx}-${tokenIdx}`}>{token.value}</span>;
        })}
      </p>
    );
  });

  const mediaNodes = parsedContent.media.map((url, idx) => {
    if (isVideoUrl(url)) {
      return (
        <video key={`vid-${idx}`} controls className="max-w-full rounded border border-[var(--bevel-dark)]">
          <source src={url} />
        </video>
      );
    }
    return (
      <img
        key={`img-${idx}`}
        src={url}
        alt="note media"
        className="max-w-full rounded border border-[var(--bevel-dark)]"
      />
    );
  });

  const timestamp = createdAt != null ? formatDateHelper(createdAt, 'datetime') : null;
  const secondary = profile && typeof profile === 'object' && (profile as any)?.name && (profile as any)?.display_name && (profile as any)?.name !== (profile as any)?.display_name
    ? (profile as any)?.name
    : undefined;

  if (!showHeader) {
    return (
      <div className="flex flex-col gap-2">
        {paragraphs.length ? paragraphs : null}
        {mediaNodes.length ? <div className="flex flex-col gap-2">{mediaNodes}</div> : null}
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-12 h-12 rounded border border-[var(--bevel-dark)] bg-[var(--chrome-bg)] overflow-hidden flex items-center justify-center text-sm font-semibold text-gray-700">
        {avatarUrl ? (
          <img src={`${avatarUrl}?w=96`} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <span>{name.slice(0, 2).toUpperCase()}</span>
        )}
      </div>
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAuthorClick}
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            {name}
          </button>
          {secondary && <span className="text-xs text-gray-500">{secondary}</span>}
          {timestamp && <span className="text-xs text-gray-500 ml-auto">{timestamp}</span>}
        </div>
        {paragraphs.length ? <div className="flex flex-col gap-2">{paragraphs}</div> : null}
        {mediaNodes.length ? <div className="flex flex-col gap-2">{mediaNodes}</div> : null}
      </div>
    </div>
  );
}

function tokenizeNoteContent(content: string): { lines: TokenizedLine[]; media: string[] } {
  if (!content) return { lines: [], media: [] };
  const lines: TokenizedLine[] = [];
  const mediaUrls: string[] = [];
  const seenMedia = new Set<string>();
  const rawLines = content.split(/\n+/);

  rawLines.forEach((rawLine) => {
    if (!rawLine.length) {
      lines.push([{ type: 'text', value: '' }]);
      return;
    }
    const parts = rawLine.split(URL_REGEX);
    const lineTokens: TokenizedLine = [];
    parts.forEach((part, index) => {
      if (!part) return;
      if (index % 2 === 1) {
        if (/^https?:\/\//i.test(part)) {
          const { core, trailing } = splitTrailingPunctuation(part);
          const href = core || part;
          lineTokens.push({ type: 'link', value: core || part, href });
          if (trailing) lineTokens.push({ type: 'text', value: trailing });
          const normalized = core || part;
          if (isMediaUrl(normalized) && !seenMedia.has(normalized)) {
            seenMedia.add(normalized);
            mediaUrls.push(normalized);
          }
          return;
        }
        if (/^nostr:/i.test(part)) {
          const { core, trailing } = splitTrailingPunctuation(part);
          const href = core || part;
          lineTokens.push({ type: 'link', value: core || part, href });
          if (trailing) lineTokens.push({ type: 'text', value: trailing });
          return;
        }
      }
      lineTokens.push({ type: 'text', value: part });
    });
    lines.push(lineTokens);
  });

  return { lines, media: mediaUrls };
}

function splitTrailingPunctuation(value: string): { core: string; trailing: string } {
  let core = value;
  let trailing = '';
  while (core.length > 0 && TRAILING_PUNCT.has(core[core.length - 1]!)) {
    trailing = core[core.length - 1]! + trailing;
    core = core.slice(0, -1);
  }
  return { core, trailing };
}

function isMediaUrl(url: string): boolean {
  return isImageUrl(url) || isVideoUrl(url);
}

function isImageUrl(url: string): boolean {
  return IMAGE_EXTENSIONS.test(normalizeUrl(url));
}

function isVideoUrl(url: string): boolean {
  return VIDEO_EXTENSIONS.test(normalizeUrl(url));
}

function normalizeUrl(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}
