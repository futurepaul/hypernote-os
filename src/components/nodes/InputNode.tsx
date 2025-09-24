import { useState } from "react";
import { useAtom } from "jotai";
import { formsAtom } from "../../state/formsAtoms";
import { interpolateText } from "./utils";

type Props = {
  text?: string;
  globals: any;
  windowId: string;
  name?: string;
  queries: Record<string, any>;
};

export function InputNode({ text, globals, windowId, name, queries }: Props) {
  const [formValues, setFormValues] = useAtom(formsAtom(windowId));
  const [localValue, setLocalValue] = useState("");
  const ph = interpolateText(text || "", globals, queries);
  const fieldName = typeof name === 'string' && name.length ? name : undefined;
  const value = fieldName ? String((formValues || {})[fieldName] ?? '') : localValue;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (fieldName) {
      setFormValues((prev: Record<string, any> | undefined) => ({ ...(prev || {}), [fieldName]: v }));
    } else {
      setLocalValue(v);
    }
  };

  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={ph}
      className="border border-gray-400 rounded px-2 py-1 text-gray-900 bg-white"
    />
  );
}
