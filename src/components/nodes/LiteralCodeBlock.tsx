type Props = {
  code: string;
  lang?: string;
};

export function LiteralCodeBlock({ code, lang }: Props) {
  return (
    <pre className="bg-[#f3f0eb] text-sm text-gray-800 rounded border border-gray-300 overflow-x-auto p-3">
      <code className="font-mono">
        {lang ? `${lang}\n` : ''}
        {code}
      </code>
    </pre>
  );
}
