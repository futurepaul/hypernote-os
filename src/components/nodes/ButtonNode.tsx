import { useMemo, useCallback } from "react";
import { useAction } from "../../state/actions";
import { buildPayload, interpolateText } from "./utils";

type Props = {
  text?: string;
  globals: any;
  action?: string;
  windowId: string;
  queries: Record<string, any>;
  payloadSpec?: any;
  data?: any;
};

export function ButtonNode({ text, globals, action, windowId, queries, payloadSpec, data }: Props) {
  const labelRaw = interpolateText(String(text ?? ""), globals, queries);
  const label = (labelRaw.trim() || "Button");
  const appearance = typeof data?.appearance === 'string' ? data.appearance : undefined;
  const iconSrc = appearance === 'app_tile' && typeof data?.icon === 'string'
    ? (() => {
        const resolved = interpolateText(data.icon, globals, queries).trim();
        return resolved ? resolved : undefined;
      })()
    : undefined;
  const payload = useMemo(() => buildPayload(payloadSpec, globals, queries), [payloadSpec, globals, queries]);
  const run = useAction(action, windowId);

  const handleClick = useCallback(() => {
    if (!action) {
      console.log("ButtonNode: no action defined");
      return;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[ButtonNode] payload', payload);
    }
    run(payload, { windowId, globals, queries }).catch(e => console.warn('action error', e));
  }, [action, payload, run, windowId, globals, queries]);

  if (appearance === 'app_tile') {
    const initials = label.slice(0, 2).toUpperCase();
    return (
      <button
        className="flex flex-col items-center gap-1 px-3 pt-3 pb-2 border border-gray-700 bg-[#c9c3bb] shadow-[inset_-2px_-2px_0_0_#6b7280,inset_2px_2px_0_0_#ffffff] hover:brightness-105 min-w-[92px]"
        onClick={handleClick}
      >
        {iconSrc ? (
          <img src={iconSrc} alt="" className="w-8 h-8 object-contain" />
        ) : (
          <div className="w-8 h-8 rounded border border-gray-700 bg-[#dcd6cd] flex items-center justify-center text-xs font-semibold text-gray-700">
            {initials}
          </div>
        )}
        <span className="text-xs text-gray-900 text-center leading-tight">{label}</span>
      </button>
    );
  }

  return (
    <button
      className="bg-gray-200 hover:bg-gray-300 text-gray-900 border border-gray-500 rounded px-3 py-1 text-sm"
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
