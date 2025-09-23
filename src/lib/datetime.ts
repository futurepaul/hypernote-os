const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
}

type FormatDatePreset = 'iso' | 'date' | 'time' | 'datetime'

type FormatDateOptions = {
  preset?: FormatDatePreset
  locale?: string
  options?: Intl.DateTimeFormatOptions
}

export function formatDateHelper(value: unknown, arg?: FormatDatePreset | FormatDateOptions | string): string {
  const date = coerceToDate(value)
  if (!date) return ''
  const config = parseFormatDateArg(arg)
  if (config.preset === 'iso') return date.toISOString()
  const options = buildIntlOptions(config)
  try {
    const formatter = new Intl.DateTimeFormat(config.locale, options)
    return formatter.format(date)
  } catch {
    const formatter = new Intl.DateTimeFormat(undefined, DEFAULT_OPTIONS)
    return formatter.format(date)
  }
}

function parseFormatDateArg(arg: unknown): { preset?: FormatDatePreset; locale?: string; options?: Intl.DateTimeFormatOptions } {
  if (arg == null) return {}
  if (typeof arg === 'string') {
    const trimmed = arg.trim()
    if (!trimmed) return {}
    if (isPreset(trimmed)) return { preset: trimmed }
    return { locale: trimmed }
  }
  if (typeof arg === 'object' && !Array.isArray(arg)) {
    const input = arg as Record<string, unknown>
    const preset = typeof input.preset === 'string' && isPreset(input.preset) ? input.preset : undefined
    const locale = typeof input.locale === 'string' && input.locale.trim() ? input.locale.trim() : undefined
    const options = typeof input.options === 'object' && input.options != null ? input.options as Intl.DateTimeFormatOptions : undefined
    return { ...(preset ? { preset } : {}), ...(locale ? { locale } : {}), ...(options ? { options } : {}) }
  }
  return {}
}

function buildIntlOptions(config: { preset?: FormatDatePreset; options?: Intl.DateTimeFormatOptions }): Intl.DateTimeFormatOptions {
  if (config.options) return config.options
  switch (config.preset) {
    case 'date':
      return { dateStyle: 'medium' }
    case 'time':
      return { timeStyle: 'short' }
    case 'datetime':
      return DEFAULT_OPTIONS
    default:
      return DEFAULT_OPTIONS
  }
}

function isPreset(value: string): value is FormatDatePreset {
  return value === 'iso' || value === 'date' || value === 'time' || value === 'datetime'
}

function coerceToDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    const millis = value > 1e12 ? value : value * 1000
    return new Date(millis)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.length) return null
    const numeric = Number(trimmed)
    if (!Number.isNaN(numeric)) return coerceToDate(numeric)
    const parsed = Date.parse(trimmed)
    if (Number.isNaN(parsed)) return null
    return new Date(parsed)
  }
  return null
}
