import profileMd from "../apps/profile.md";
import walletMd from "../apps/wallet.md";
import clockMd from "../apps/clock.md";
import appsMd from "../apps/apps.md";
import editorMd from "../apps/editor.md";
import YAML from 'yaml'

export function getDefaultDocs(): Record<string, string> {
  return {
    profile: profileMd,
    wallet: walletMd,
    clock: clockMd,
    switcher: appsMd,
    editor: editorMd,
  }
}

export async function hydrateDocsFromAssets(docs: Record<string, string>) {
  const updated: Record<string, string> = {}
  const assetRe = /\/(_bun|assets)\/asset\/.+\.md$/
  await Promise.all(Object.entries(docs).map(async ([k, v]) => {
    if (assetRe.test(v)) {
      try { const res = await fetch(v); if (res.ok) updated[k] = await res.text() } catch {}
    }
  }))
  return Object.keys(updated).length ? { ...docs, ...updated } : docs
}

export function parseFrontmatterName(doc: string): string | undefined {
  try {
    if (doc.startsWith('---\n')) {
      const idx = doc.indexOf('\n---\n', 4)
      if (idx !== -1) {
        const meta = YAML.parse(doc.slice(4, idx))
        if (meta?.name) return String(meta.name)
      }
    }
  } catch {}
  return undefined
}

