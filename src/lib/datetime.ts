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

export function formatDateHelper(value: unknown, arg?: FormatDatePreset | FormatDateOptions | string | number | boolean): string {
  const date = coerceToDate(value)
  if (!date) return ''
  const config = normalizeConfig(arg)
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

function normalizeConfig(arg?: FormatDatePreset | FormatDateOptions | string | number | boolean): { preset?: FormatDatePreset; locale?: string; options?: Intl.DateTimeFormatOptions } {
  if (arg == null) return {}
  if (typeof arg === 'string') {
    const trimmed = arg.trim()
    if (trimmed === 'iso' || trimmed === 'date' || trimmed === 'time' || trimmed === 'datetime') {
      return { preset: trimmed }
    }
    if (trimmed.length === 0) return {}
    return { locale: trimmed }
  }
  if (typeof arg === 'number' || typeof arg === 'boolean') return { locale: String(arg) }
  if (typeof arg === 'object') return { preset: arg.preset, locale: arg.locale, options: arg.options }
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
