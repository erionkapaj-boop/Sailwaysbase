import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchPeriods } from '../lib/availabilityApi'
import { fetchCharters } from '../lib/chartersApi'
import { addMonths, buildMonthGrid, isWithin, toISODate } from '../lib/dateUtils'
import Header from '../components/Header'

const WEEKDAYS = ['Δ', 'Τ', 'Τ', 'Π', 'Π', 'Σ', 'Κ']

function periodForDate(periods, iso) {
  return periods.find((p) => isWithin(iso, p.start_date, p.end_date))
}

function charterForDate(charters, iso) {
  return charters.find((c) => isWithin(iso, c.start_date, c.end_date))
}

export default function Calendar() {
  const { user } = useAuth()
  const [viewDate, setViewDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [periods, setPeriods] = useState([])
  const [charters, setCharters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([fetchPeriods(user.id), fetchCharters(user.id)])
      .then(([p, c]) => {
        if (!active) return
        setPeriods(p)
        setCharters(c)
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [user.id])

  const days = useMemo(() => buildMonthGrid(viewDate), [viewDate])
  const todayIso = toISODate(new Date())

  return (
    <div className="pb-24">
      <Header
        title="Ημερολόγιο"
        action={
          <Link to="/calendar/new" className="text-sm text-accent-600 font-medium">
            + Περίοδος
          </Link>
        }
      />

      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setViewDate((d) => addMonths(d, -1))} className="w-8 h-8 text-gray-400">
            ‹
          </button>
          <span className="text-sm font-medium">
            {viewDate.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => setViewDate((d) => addMonths(d, 1))} className="w-8 h-8 text-gray-400">
            ›
          </button>
        </div>

        <div className="rounded-xl bg-white shadow-soft border border-gray-100 p-3">
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="text-center text-[11px] text-gray-400 py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map(({ date, iso, inMonth }) => {
              const period = periodForDate(periods, iso)
              const charter = charterForDate(charters, iso)
              let cellClass = 'text-gray-700'
              if (!inMonth) cellClass = 'text-gray-300'
              else if (charter) cellClass = 'bg-accent-500 text-white'
              else if (period && !period.is_available) cellClass = 'bg-gray-200 text-gray-500'
              else if (period && period.is_available) cellClass = 'bg-green-100 text-green-700'

              return (
                <Link
                  key={iso}
                  to={period ? `/calendar/${period.id}` : '/calendar/new'}
                  state={!period ? { startDate: iso, endDate: iso } : undefined}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs ${cellClass} ${
                    iso === todayIso ? 'ring-2 ring-accent-500' : ''
                  }`}
                >
                  {date.getDate()}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-green-100 inline-block" /> Διαθέσιμος
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-gray-200 inline-block" /> Μη διαθέσιμος
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-500 inline-block" /> Charter
          </span>
        </div>

        <h2 className="text-sm font-medium text-gray-500 mt-6 mb-2">Περίοδοι διαθεσιμότητας</h2>
        {loading && <p className="text-sm text-gray-400">Φόρτωση…</p>}
        {!loading && periods.length === 0 && (
          <p className="text-sm text-gray-400">Δεν έχεις ορίσει ακόμα περιόδους διαθεσιμότητας.</p>
        )}
        <div className="rounded-xl bg-white shadow-soft border border-gray-100 divide-y divide-gray-100 overflow-hidden">
          {periods.map((p) => (
            <Link key={p.id} to={`/calendar/${p.id}`} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  {new Date(p.start_date).toLocaleDateString('el-GR')} – {new Date(p.end_date).toLocaleDateString('el-GR')}
                </p>
                {p.notes && <p className="text-xs text-gray-400">{p.notes}</p>}
              </div>
              {p.is_available ? (
                <span className="text-sm text-green-700 font-medium">
                  {p.price_per_day ? `${p.price_per_day}€/ημ.` : 'Διαθέσιμος'}
                </span>
              ) : (
                <span className="text-sm text-gray-400">Κλειστό</span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
