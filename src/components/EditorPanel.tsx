// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import OverType from "overtype";
import { useAtom } from 'jotai'
import { docsAtom } from '../state/appAtoms'
import { parseFrontmatterName } from "../state/docs";

export function EditorPanel() {
  const [docs, setDocs] = useAtom(docsAtom)
  const files = useMemo(() => ["profile", "wallet", "clock", "apps"], [])
  const [current, setCurrent] = useState<string>(files[0])
  const [value, setValue] = useState<string>(docs[current as keyof typeof docs] || "")
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<any>(null)

  useEffect(() => {
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
    setDocs({ ...docs, [current]: value })
  }

  return (
    <div className="flex h-[420px] w-[760px]">
      {/* Sidebar */}
      <div className="w-48 border-r border-gray-500 bg-gray-100">
        {files.map(fid => {
          const name = parseFrontmatterName(docs[fid as keyof typeof docs] || "") || fid
          const active = fid === current
          return (
            <button
              key={fid}
              onClick={() => setCurrent(fid)}
              className={`w-full text-left px-3 py-2 text-sm border-b border-gray-300 ${
                active ? "bg-yellow-200" : "hover:bg-gray-200"
              }`}
            >
              {name}
            </button>
          )
        })}
      </div>
      {/* Editor */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-2 py-1 border-b border-gray-400 bg-gray-200">
          <div className="text-xs text-gray-700">{current}.md</div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (confirm("Reload all docs from defaults? This will overwrite your local changes.")) {
                  const next = await import('../state/docs').then(m => m.getDefaultDocs())
                  setDocs(next)
                  setCurrent("profile")
                }
              }}
              className="bg-gray-200 hover:bg-gray-300 border border-gray-600 rounded px-3 py-1 text-sm"
              title="Reload default docs"
            >
              Reset Docs
            </button>
            <button onClick={save} className="bg-gray-300 hover:bg-gray-400 border border-gray-600 rounded px-3 py-1 text-sm">
              Save
            </button>
          </div>
        </div>
        <div ref={containerRef} style={{ height: 360 }} />
      </div>
    </div>
  )
}
