function toValidDate(value: number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return date
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

const relativeFormatterCache = new Map<string, Intl.RelativeTimeFormat>()

function getRelativeFormatter(locale: string) {
  const key = locale || 'zh-CN'
  const cached = relativeFormatterCache.get(key)
  if (cached) return cached
  const formatter = new Intl.RelativeTimeFormat(key, {
    numeric: 'always'
  })
  relativeFormatterCache.set(key, formatter)
  return formatter
}

export function formatDateTime(value: number | Date) {
  const date = toValidDate(value)
  if (!date) return '--'
  const year = date.getFullYear()
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())
  const hour = pad2(date.getHours())
  const minute = pad2(date.getMinutes())
  return `${year}-${month}-${day} ${hour}:${minute}`
}

export function formatRelativeTimeFromNow(value: number | Date, locale = 'zh-CN') {
  const date = toValidDate(value)
  if (!date) return '--'
  const diffSeconds = (date.getTime() - Date.now()) / 1000
  const absSeconds = Math.abs(diffSeconds)
  const formatter = getRelativeFormatter(locale)

  if (absSeconds < 60) {
    return formatter.format(Math.round(diffSeconds), 'second')
  }
  if (absSeconds < 3600) {
    return formatter.format(Math.round(diffSeconds / 60), 'minute')
  }
  if (absSeconds < 86400) {
    return formatter.format(Math.round(diffSeconds / 3600), 'hour')
  }
  if (absSeconds < 2592000) {
    return formatter.format(Math.round(diffSeconds / 86400), 'day')
  }
  if (absSeconds < 31536000) {
    return formatter.format(Math.round(diffSeconds / 2592000), 'month')
  }
  return formatter.format(Math.round(diffSeconds / 31536000), 'year')
}
