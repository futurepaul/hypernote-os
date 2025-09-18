import { describe, expect, test } from "bun:test";
import { compileMarkdownDoc } from "./compiler";
import { publishApp, installByNaddr } from "./services/apps";
import { getDefaultStore } from "jotai";
import { hypersauceClientAtom } from "./state/hypersauce";
import { HypersauceClient } from "hypersauce";
import { finalizeEvent, getPublicKey } from "nostr-tools";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("invalid hex length");
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

describe("publish/install roundtrip", () => {
  const relay = process.env.HYPERNOTE_TEST_RELAY ?? "ws://localhost:10547";
  const skHex = process.env.TEST_NSEC;
  const pkHexEnv = process.env.TEST_NPUB;

  if (!skHex) {
    test.skip("requires TEST_NSEC env", () => {});
    return;
  }

  const pubkey = pkHexEnv || getPublicKey(hexToBytes(skHex));

  test("publishApp → installByNaddr returns matching doc", async () => {
    const store = getDefaultStore();
    const prevClient = store.get(hypersauceClientAtom);
    const prevNostr = (globalThis as any).nostr;

    const client = new HypersauceClient({ relays: [relay] });
    store.set(hypersauceClientAtom, client);

    (globalThis as any).nostr = {
      async getPublicKey() {
        return pubkey;
      },
      async signEvent(unsigned: any) {
        const { kind, content, tags, created_at } = unsigned;
        const event = finalizeEvent({ kind, content, tags, created_at }, skHex);
        return event;
      },
    };

    try {
      const source = `---\nname: Test Roundtrip\nicon: folder.png\n---\nHello from tests.\n`;
      const compiled = compileMarkdownDoc(source);

      const publishRes = await publishApp(compiled, [relay]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const installed = await installByNaddr(publishRes.naddr, [relay]);

      expect(installed.meta).toEqual(compiled.meta);
      expect(installed.ast).toEqual(compiled.ast);
    } finally {
      store.set(hypersauceClientAtom, prevClient ?? null);
      if (prevNostr === undefined) delete (globalThis as any).nostr;
      else (globalThis as any).nostr = prevNostr;
      try {
        (client as any)?.pool?.close?.([relay]);
      } catch {}
    }
  }, 20000);
});
