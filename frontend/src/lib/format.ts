const DEFAULT_CURRENCY = 'INR'

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function formatAmount(
  value: string | number | null | undefined,
  currency: string | null | undefined = DEFAULT_CURRENCY,
): string {
  const n = toNumber(value)
  if (n === null) return '—'
  const code = currency || DEFAULT_CURRENCY
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return `${n.toFixed(2)} ${code}`
  }
}

export function formatSignedAmount(
  value: string | number | null | undefined,
  currency: string | null | undefined = DEFAULT_CURRENCY,
): string {
  const n = toNumber(value)
  if (n === null) return '—'
  const formatted = formatAmount(Math.abs(n), currency)
  if (n > 0) return `+${formatted}`
  if (n < 0) return `−${formatted}`
  return formatted
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatNumber(
  value: string | number | null | undefined,
  fractionDigits = 2,
): string {
  const n = toNumber(value)
  if (n === null) return '—'
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n)
}

export function formatSignedNumber(
  value: string | number | null | undefined,
  fractionDigits = 2,
): string {
  const n = toNumber(value)
  if (n === null) return '—'
  const formatted = formatNumber(Math.abs(n), fractionDigits)
  if (n > 0) return `+${formatted}`
  if (n < 0) return `−${formatted}`
  return formatted
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function shortId(value: string | null | undefined, length = 8): string {
  if (!value) return '—'
  return value.length <= length ? value : value.slice(0, length)
}
