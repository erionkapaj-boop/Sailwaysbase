import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchCharters } from '../lib/chartersApi'
import Header from '../components/Header'

export default function Charters() {
  const { user } = useAuth()
  const [charters, setCharters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchCharters(user.id)
      .then((data) => active && setCharters(data))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [user.id])

  const todayIso = new Date().toISOString().slice(0, 10)
  const upcoming = charters.filter((c) => c.end_date >= todayIso)
  const past = charters.filter((c) => c.end_date < todayIso)

  function Row({ c }) {
    return (
      <Link key={c.id} to={`/charters/${c.id}`} className="block px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            {new Date(c.start_date).toLocaleDateString('el-GR')} – {new Date(c.end_date).toLocaleDateString('el-GR')}
          </p>
          {c.fee != null && <span className="text-sm text-accent-600 font-medium">{c.fee}€</span>}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          {[c.vessel_name, c.company_name].filter(Boolean).join(' · ') || 'Χωρίς επιπλέον στοιχεία'}
        </p>
      </Link>
    )
  }

  return (
    <div className="pb-24">
      <Header
        title="Ναυλώσεις"
        action={
          <Link
            to="/charters/new"
            className="w-9 h-9 rounded-full bg-accent-500 text-white flex items-center justify-center text-xl leading-none"
            aria-label="Νέο charter"
          >
            +
          </Link>
        }
      />

      <div className="px-4 space-y-6">
        {loading && <p className="text-sm text-gray-400">Φόρτωση…</p>}

        {!loading && charters.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">Δεν υπάρχουν ναυλώσεις ακόμα.</p>
        )}

        {upcoming.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Επόμενα / τρέχοντα</h2>
            <div className="rounded-xl bg-white shadow-soft border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {upcoming.map((c) => (
                <Row key={c.id} c={c} />
              ))}
            </div>
          </section>
        )}

        {past.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Προηγούμενα</h2>
            <div className="rounded-xl bg-white shadow-soft border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {past.map((c) => (
                <Row key={c.id} c={c} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
