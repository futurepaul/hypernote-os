import { create } from "zustand";
import YAML from "yaml";
// raw markdown app sources
// These imports rely on our md loader during build; in dev, Bun supports importing text for many extensions.
import profileMd from "../apps/profile.md";
import walletMd from "../apps/wallet.md";
import clockMd from "../apps/clock.md";
import appsMd from "../apps/apps.md";
import editorMd from "../apps/editor.md";
import { SimplePool, type Event } from "nostr-tools";

export type WindowId = "profile" | "wallet" | "clock" | "switcher" | "editor";
export type WindowType = Exclude<WindowId, never>;

export type Point = { x: number; y: number };

export interface WindowInfo {
  id: WindowId;
  title: string;
  type: WindowType;
  pos: Point;
  z: number;
  active: boolean;
}

export interface WindowsState {
  windows: Record<WindowId, WindowInfo>;
  activeId: WindowId | null;
  nextZ: number;
  setActive: (id: WindowId) => void;
  setPos: (id: WindowId, pos: Point) => void;
  // docs and globals
  docs: Record<WindowId, string>;
  setDoc: (id: WindowId, doc: string) => void;
  globals: { user: { pubkey: string | null; profile?: any }; time: { now: number } };
  setUserPubkey: (pk: string | null) => void;
  setUserProfile: (p: any) => void;
  setTimeNow: (now: number) => void;
  actions: Record<string, (args?: any) => Promise<void> | void>;
  runAction: (name: string, args?: any) => Promise<void>;
  // query runtime bindings
  relays: string[];
  setRelays: (relays: string[]) => void;
  queryScalars: Record<WindowId, Record<string, any>>;
  setQueryScalars: (id: WindowId, scalars: Record<string, any>) => void;
  startQueriesFor: (id: WindowId, meta: Record<string, any>) => Promise<void>;
  stopQueriesFor: (id: WindowId) => void;
  resetDocsToDefaults: () => void;
  hydrateDocsFromAssets: () => Promise<void>;
}

const initialWindows: Record<WindowId, WindowInfo> = {
  profile: {
    id: "profile",
    title: "Profile",
    type: "profile",
    pos: { x: 80, y: 120 },
    z: 1,
    active: true,
  },
  wallet: {
    id: "wallet",
    title: "Wallet",
    type: "wallet",
    pos: { x: 320, y: 160 },
    z: 2,
    active: false,
  },
  clock: {
    id: "clock",
    title: "Clock",
    type: "clock",
    pos: { x: 560, y: 80 },
    z: 3,
    active: false,
  },
  switcher: {
    id: "switcher",
    title: "Switcher",
    type: "switcher",
    pos: { x: 900, y: 16 },
    z: 1000,
    active: false,
  },
  editor: {
    id: "editor",
    title: "Editor",
    type: "editor",
    pos: { x: 760, y: 200 },
    z: 1002,
    active: false,
  },
};

export function getDefaultDocs(): Record<WindowId, string> {
  return {
    profile: profileMd,
    wallet: walletMd,
    clock: clockMd,
    switcher: appsMd,
    editor: editorMd,
  } as Record<WindowId, string>;
}

export const useWindows = create<WindowsState>((set, get) => ({
  windows: initialWindows,
  activeId: "profile",
  nextZ: 1001,
  setActive: (id: WindowId) => {
    const state = get();
    const windows = { ...state.windows };
    for (const w of Object.values(windows)) w.active = false;
    const w = { ...windows[id] };
    w.active = true;
    w.z = state.nextZ;
    windows[id] = w as WindowInfo;
    set({ windows, activeId: id, nextZ: state.nextZ + 1 });
  },
  setPos: (id: WindowId, pos: Point) => {
    const state = get();
    const w = { ...state.windows[id], pos };
    set({ windows: { ...state.windows, [id]: w } });
  },
  // Source of truth is src/apps/*.md (imported via loader). No localStorage.
  docs: getDefaultDocs(),
  setDoc: (id: WindowId, doc: string) => {
    const state = get();
    const docs = { ...state.docs, [id]: doc } as Record<WindowId, string>;
    // Update window title from frontmatter if present
    try {
      const m = /^---\n([\s\S]*?)\n---/m.exec(doc);
      if (m) {
        const meta = YAML.parse(m[1]);
        if (meta?.name) {
          const w = { ...state.windows[id], title: String(meta.name) };
          set({ windows: { ...state.windows, [id]: w } });
        }
      }
    } catch {}
    set({ docs });
    // No persistence to localStorage — docs come from src/apps/*.md
  },
  globals: { user: { pubkey: null }, time: { now: Math.floor(Date.now() / 1000) } },
  setUserPubkey: (pk: string | null) => set(state => {
    console.log("setUserPubkey ->", pk);
    return { globals: { ...state.globals, user: { ...state.globals.user, pubkey: pk } } };
  }),
  setUserProfile: (p: any) => set(state => ({ globals: { ...state.globals, user: { ...state.globals.user, profile: p } } })),
  setTimeNow: (now: number) => set(state => ({ globals: { ...state.globals, time: { now } } })),
  actions: {
    "@load_profile": async () => {
      const state = get();
      const pk = state.globals.user.pubkey;
      if (!pk) {
        console.warn("@load_profile: user.pubkey is not set");
        return;
      }
      const RELAYS = [
        "wss://relay.damus.io",
        "wss://nos.lol",
        "wss://relay.snort.social",
      ];
      const pool = new SimplePool();
      try {
        console.log("@load_profile: querying kind 0 for", pk);
        const events: Event[] = await pool.querySync(RELAYS, { kinds: [0], authors: [pk], limit: 1 });
        if (events.length) {
          try {
            const content = JSON.parse(events[0].content);
            get().setUserProfile(content);
            console.log("@load_profile: loaded profile", content?.name || content?.display_name || Object.keys(content || {}).length + " fields");
          } catch {}
        } else {
          console.warn("@load_profile: no profile found on relays");
        }
      } finally {
        pool.close(RELAYS);
      }
    },
  },
  runAction: async (name: string, args?: any) => {
    const fn = get().actions[name];
    if (fn) await fn(args);
  },
  // queries
  relays: ["wss://nos.lol", "wss://relay.damus.io", "wss://relay.snort.social"],
  setRelays: (relays: string[]) => {
    set({ relays });
    // best-effort update of runtime if initialized
    import("../queries/runtime").then(m => m.queryRuntime.setRelays(relays)).catch(() => {});
  },
  queryScalars: {} as Record<WindowId, Record<string, any>>,
  setQueryScalars: (id: WindowId, scalars: Record<string, any>) => {
    const prev = get().queryScalars[id] || {};
    // shallow merge and avoid update if identical
    let changed = false;
    const next = { ...prev } as Record<string, any>;
    for (const k of Object.keys(scalars)) {
      if (next[k] !== scalars[k]) { next[k] = scalars[k]; changed = true; }
    }
    if (changed) set({ queryScalars: { ...get().queryScalars, [id]: next } });
  },
  startQueriesFor: async (id: WindowId, meta: Record<string, any>) => {
    const { relays, globals } = get();
    const { queryRuntime } = await import("../queries/runtime");
    await queryRuntime.start({
      windowId: id,
      meta,
      relays,
      context: { user: { pubkey: globals.user.pubkey } },
      onScalars: (scalars) => get().setQueryScalars(id, scalars),
    });
  },
  stopQueriesFor: (id: WindowId) => {
    import("../queries/runtime").then(m => m.queryRuntime.stop(id)).catch(() => {});
  },
  resetDocsToDefaults: () => {
    const defaults = getDefaultDocs();
    // Update titles from frontmatter
    const state = get();
    const newWindows = { ...state.windows };
    for (const id of Object.keys(defaults) as WindowId[]) {
      const doc = defaults[id];
      try {
        const m = /^---\n([\s\S]*?)\n---/m.exec(doc);
        if (m) {
          const meta = YAML.parse(m[1]);
          if (meta?.name) {
            newWindows[id] = { ...newWindows[id], title: String(meta.name) };
          }
        }
      } catch {}
    }
    set({ docs: defaults, windows: newWindows });
    // After resetting, hydrate in case dev returned asset URLs
    get().hydrateDocsFromAssets();
  },
  hydrateDocsFromAssets: async () => {
    const state = get();
    const docs = { ...state.docs } as Record<WindowId, string>;
    const updated: Record<WindowId, string> = {} as any;
    const assetRe = /\/(_bun|assets)\/asset\/.+\.md$/;
    const keys = Object.keys(docs) as WindowId[];
    await Promise.all(keys.map(async (k) => {
      const v = docs[k];
      if (typeof v === 'string' && (assetRe.test(v) || v.endsWith('.md'))) {
        try {
          const res = await fetch(v);
          if (res.ok) {
            const text = await res.text();
            updated[k] = text;
          }
        } catch {}
      }
    }));
    if (Object.keys(updated).length) {
      // update titles from frontmatter where present
      const newWindows = { ...state.windows };
      for (const id of Object.keys(updated) as WindowId[]) {
        const doc = updated[id];
        try {
          const m = /^---\n([\s\S]*?)\n---/m.exec(doc);
          if (m) {
            const meta = YAML.parse(m[1]);
            if (meta?.name) newWindows[id] = { ...newWindows[id], title: String(meta.name) };
          }
        } catch {}
      }
      const merged = { ...docs, ...updated };
      set({ docs: merged, windows: newWindows });
      // Do not persist to localStorage
    }
  },
}));
