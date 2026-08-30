export function toISODate(date) {
  return date.toISOString().slice(0, 10)
}

export function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

// Monday-first grid covering the full month, including leading/trailing
// days from neighboring months so every week row has 7 cells.
export function buildMonthGrid(viewDate) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const startWeekday = (firstOfMonth.getDay() + 6) % 7 // 0 = Monday
  const gridStart = new Date(year, month, 1 - startWeekday)

  const days = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
    days.push({ date: d, iso: toISODate(d), inMonth: d.getMonth() === month })
  }
  return days
}

export function isWithin(iso, startIso, endIso) {
  return iso >= startIso && iso <= endIso
}
