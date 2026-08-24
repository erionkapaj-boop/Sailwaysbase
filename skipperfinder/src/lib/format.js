export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateRange(startIso, endIso) {
  if (!startIso) return ''
  if (!endIso || endIso === startIso) return formatDate(startIso)
  return `${formatDate(startIso)} – ${formatDate(endIso)}`
}

export function formatPrice(value, currency = 'EUR') {
  if (value === null || value === undefined || value === '') return null
  try {
    return new Intl.NumberFormat('el-GR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${value} ${currency}`
  }
}

export function discountPercent(price, originalPrice) {
  if (!price || !originalPrice || originalPrice <= price) return null
  return Math.round((1 - price / originalPrice) * 100)
}

export function nightsBetween(startIso, endIso) {
  if (!startIso || !endIso) return null
  const start = new Date(startIso + 'T00:00:00')
  const end = new Date(endIso + 'T00:00:00')
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : null
}
