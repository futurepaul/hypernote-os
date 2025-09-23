import OverType, { type Options, type Theme } from "overtype";

// Shared Hypernote look and feel for every OverType instance.
const HYPERNOTE_THEME: Theme = {
  name: "hypernote",
  colors: {
    bgPrimary: "var(--win-bg)",
    bgSecondary: "rgba(255, 255, 255, 0.92)",
    text: "#201711",
    textSecondary: "rgba(32, 23, 17, 0.65)",
    h1: "#16100c",
    h2: "#2c2017",
    h3: "#3d2f23",
    strong: "#2c697d",
    em: "#8a4a24",
    link: "#2c697d",
    code: "#32261c",
    codeBg: "rgba(44, 105, 125, 0.12)",
    blockquote: "#6f4c2d",
    hr: "rgba(32, 23, 17, 0.2)",
    syntaxMarker: "rgba(32, 23, 17, 0.45)",
    listMarker: "#865a36",
    cursor: "#2c697d",
    selection: "rgba(44, 105, 125, 0.28)",
    toolbarBg: "rgba(255, 255, 255, 0.94)",
    toolbarIcon: "#241a14",
    toolbarHover: "rgba(36, 33, 30, 0.12)",
    toolbarActive: "rgba(44, 105, 125, 0.2)",
    border: "rgba(32, 23, 17, 0.24)",
  },
};

const BASE_OVERTYPE_OPTIONS: Options = {
  toolbar: false,
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: "14px",
  lineHeight: 1.5,
  padding: "16px",
};

let themeApplied = false;

export function ensureOvertypeTheme() {
  if (themeApplied) return;
  if (typeof document === "undefined") return;
  try {
    OverType.setTheme(HYPERNOTE_THEME);
    themeApplied = true;
  } catch (err) {
    console.warn("[OverType] failed to apply theme", err);
  }
}

type OvertypeTarget = Parameters<typeof OverType.init>[0];

type PartialOptions = Partial<Options>;

export function initOvertype(target: OvertypeTarget, options: PartialOptions = {}) {
  ensureOvertypeTheme();
  const merged: Options = {
    ...BASE_OVERTYPE_OPTIONS,
    ...(options as Options),
  };
  return OverType.init(target as any, merged);
}

export { BASE_OVERTYPE_OPTIONS };
