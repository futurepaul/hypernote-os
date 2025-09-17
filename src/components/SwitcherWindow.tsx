import { DraggableWindow } from "./DraggableWindow";
import { useWindows } from "../store/windows";

export function SwitcherWindow() {
  const { windows, setActive, activeId, docs } = useWindows();
  const list = Object.values(windows)
    .filter(w => w.id !== "switcher")
    .sort((a, b) => a.title.localeCompare(b.title));

  const switcherTitle = (() => {
    const doc = docs.switcher || "";
    const m = /^---\n([\s\S]*?)\n---/m.exec(doc);
    if (m) {
      try {
        const YAML = require("yaml");
        const meta = YAML.parse(m[1]);
        if (meta?.name) return String(meta.name);
      } catch {}
    }
    return "Apps";
  })();

  return (
    <DraggableWindow id="switcher" title={switcherTitle}>
      <div className="flex gap-2">
        {list.map(w => (
          <button
            key={w.id}
            onClick={() => setActive(w.id)}
            className={`px-2 py-1 border border-gray-500 rounded text-sm ${
              activeId === w.id ? "bg-yellow-300" : "bg-gray-200 hover:bg-gray-300"
            }`}
            title={w.title}
          >
            {w.title}
          </button>
        ))}
      </div>
    </DraggableWindow>
  );
}
