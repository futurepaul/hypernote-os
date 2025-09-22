// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import OverType from "overtype";
import { useAtom, useSetAtom, useAtomValue } from 'jotai'
import { docsAtom, openWindowAtom, bringWindowToFrontAtom, relaysAtom, editorSelectionAtom } from '../state/appAtoms'
import { parseFrontmatterName } from "../state/docs";
import { getDefaultDocs, saveUserDocs, loadUserDocs, isDefaultDocId } from '../state/docs'
import { compileMarkdownDoc } from '../compiler'
import { publishApp, installByNaddr } from '../services/apps'

export function EditorPanel() {
  const [docs, setDocs] = useAtom(docsAtom)
  const openWin = useSetAtom(openWindowAtom)
  const bringToFront = useSetAtom(bringWindowToFrontAtom)
  const relays = useAtomValue(relaysAtom)
  const builtinOrder = useMemo(() => Object.keys(getDefaultDocs()), [])
  const files = useMemo(() => {
    const nonEditable = new Set(['apps', 'editor', 'system'])
    const seen = new Set<string>()
    const ordered: string[] = []
    builtinOrder.forEach((id) => {
      if (docs[id as keyof typeof docs] && !nonEditable.has(id)) {
        ordered.push(id)
        seen.add(id)
      }
    })
    Object.keys(docs).forEach((id) => {
      if (!seen.has(id) && !nonEditable.has(id)) ordered.push(id)
    })
    return ordered
  }, [docs, builtinOrder])
  const [current, setCurrent] = useAtom(editorSelectionAtom)
  const [value, setValue] = useState<string>(() => (current ? (docs[current as keyof typeof docs] || '') : ''))
  const [publishing, setPublishing] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<any>(null)

  useEffect(() => {
    if (!files.length) return
    if (!current || !files.includes(current)) setCurrent(files[0])
  }, [files, current])

  useEffect(() => {
    if (!current) {
      setValue('')
      return
    }
    setValue(docs[current as keyof typeof docs] || "")
  }, [current, docs])

  useEffect(() => {
    if (!containerRef.current) return
    const [instance] = OverType.init(containerRef.current, {
      value,
      toolbar: false,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: '14px',
      lineHeight: 1.5,
      onChange: (val: string) => setValue(val),
    } as any)
    editorRef.current = instance
    return () => editorRef.current?.destroy?.()
  }, [])

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.getValue()) {
      editorRef.current.setValue(value)
    }
  }, [value])

  function save() {
    const nextDocs = { ...docs, [current]: value }
    setDocs(nextDocs)
    // Persist only non-default docs
    if (!isDefaultDocId(current)) {
      const userDocs = loadUserDocs()
      saveUserDocs({ ...userDocs, [current]: value })
    }
  }

  async function publish() {
    if (!current) {
      alert('Select a document before publishing.')
      return
    }
    let compiled: { meta: any; ast: any }
    try {
      compiled = compileMarkdownDoc(value)
    } catch (e) {
      alert('Failed to compile document: ' + (e as any)?.message)
      setPublishing(false)
      return
    }
    if (!compiled?.meta || typeof compiled.meta !== 'object' || !compiled.meta.hypernote?.name) {
      alert('Frontmatter must include `hypernote.name` before publishing.')
      setPublishing(false)
      return
    }
    setPublishing(true)
    try {
      const { meta, ast } = compiled
      const { naddr } = await publishApp({ meta, ast }, relays)
      const installed = await installByNaddr(naddr, relays)
      setDocs(prev => ({ ...prev, [installed.id]: installed.markdown }))
      if (!isDefaultDocId(installed.id)) {
        const userDocs = loadUserDocs()
        saveUserDocs({ ...userDocs, [installed.id]: installed.markdown })
      }
      setCurrent(installed.id)
      setValue(installed.markdown)
      try {
        openWin(installed.id)
        bringToFront(installed.id)
      } catch {}
      alert(`Published! ${naddr}`)
    } catch (e) {
      alert('Publish failed: ' + (e as any)?.message)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="flex h-[80vh] w-[820px]">
      {/* Sidebar */}
      <div className="w-52 border-r border-[var(--bevel-dark)] bg-[var(--chrome-bg)]">
        {files.map(fid => {
          const name = parseFrontmatterName(docs[fid as keyof typeof docs] || "") || fid
          const active = fid === current
          return (
            <button
              key={fid}
              onClick={() => setCurrent(fid)}
              className={`w-full text-left px-3 py-2 text-sm border-b border-[var(--bevel-dark)] ${
                active ? "bg-[var(--title-bg-light)]" : "hover:bg-[var(--win-bg)]"
              }`}
            >
              {name}
            </button>
          )
        })}
      </div>
      {/* Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Menubar */}
        <div className="flex items-center gap-2 px-2 py-1 bg-[var(--accent)] text-white border-b border-[var(--bevel-dark)]">
          <div className="font-semibold text-sm mr-2">File</div>
          <button onClick={save} className="px-2 py-0.5 text-sm bg-[var(--win-bg)] text-gray-900 border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105">Save</button>
          <button
            onClick={publish}
            disabled={publishing}
            className={`px-2 py-0.5 text-sm border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] ${publishing ? 'opacity-70 cursor-not-allowed bg-[var(--chrome-bg)] text-gray-600' : 'bg-[var(--win-bg)] text-gray-900 hover:brightness-105'}`}
          >{publishing ? 'Publishing…' : 'Publish'}</button>
          <button
            onClick={() => {
              const blob = new Blob([value], { type: 'text/markdown;charset=utf-8' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `${current}.md`
              document.body.appendChild(a)
              a.click()
              a.remove()
              URL.revokeObjectURL(a.href)
            }}
            className="ml-4 px-2 py-0.5 text-sm bg-[var(--win-bg)] text-gray-900 border border-[var(--bevel-dark)] shadow-[inset_-1px_-1px_0_0_var(--bevel-dark),inset_1px_1px_0_0_var(--bevel-light)] hover:brightness-105"
          >Export .md</button>
        </div>
        <div ref={containerRef} className="flex-1 overflow-hidden" style={{ height: '100%' }} />
      </div>
    </div>
  )
}
