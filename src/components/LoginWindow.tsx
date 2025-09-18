import { useState } from 'react'
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { bootStageAtom, userAtom, relaysAtom } from '../state/appAtoms'
import { hypersauceClientAtom } from '../state/hypersauce'
import { nip19 } from 'nostr-tools'
import { DraggableWindow } from './DraggableWindow'

export function LoginWindow() {
  const [npub, setNpub] = useState('')
  const [boot, setBoot] = useAtom(bootStageAtom)
  const setUser = useSetAtom(userAtom)
  const relays = useAtomValue(relaysAtom)
  const client = useAtomValue(hypersauceClientAtom) as any

  async function useNip07() {
    try {
      if (!client) throw new Error('Hypersauce client not initialized')
      const { pubkey } = await client.login()
      setUser(u => ({ ...u, pubkey }))
      setBoot('ready')
    } catch (e: any) {
      alert('Login failed: ' + (e?.message || e))
    }
  }

  function continueWithNpub() {
    try {
      const v = npub.trim()
      if (!v) return
      let hex: string | null = null
      if (/^[0-9a-fA-F]{64}$/.test(v)) hex = v.toLowerCase()
      else {
        const d = nip19.decode(v)
        if (d.type === 'npub') {
          const data = d.data as Uint8Array | string
          hex = typeof data === 'string' ? data : Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('')
        } else throw new Error('Please paste an npub')
      }
      if (!hex) throw new Error('Invalid npub')
      setUser(u => ({ ...u, pubkey: hex }))
      setBoot('ready')
    } catch (e: any) {
      alert(e?.message || String(e))
    }
  }

  return (
    <DraggableWindow id="login" title="Login">
      <div className="flex flex-col gap-3 w-[360px]">
        <div className="text-sm">Welcome to Hypernote. Log in to continue.</div>
        <div className="flex items-center gap-2">
          <input
            placeholder="Paste npub..."
            value={npub}
            onChange={e => setNpub(e.target.value)}
            className="flex-1 border border-[var(--bevel-dark)] rounded px-2 py-1 bg-white text-gray-900"
          />
          <button onClick={continueWithNpub} className="px-3 py-1 text-sm bg-[var(--win-bg)] border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105">Continue</button>
        </div>
        <div className="text-xs text-gray-700">or</div>
        <button onClick={useNip07} className="px-3 py-1 text-sm bg-[var(--win-bg)] border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105">Use NIP‑07 Extension</button>
      </div>
    </DraggableWindow>
  )
}

