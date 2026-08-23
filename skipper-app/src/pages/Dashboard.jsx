import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchLatestCheck } from '../lib/inventoryApi'
import { fetchUpcomingCharter } from '../lib/chartersApi'

export default function Dashboard() {
  const { user } = useAuth()
  const [latestCheck, setLatestCheck] = useState(null)
  const [upcoming, setUpcoming] = useState(null)

  useEffect(() => {
    let active = true
    fetchLatestCheck(user.id).then((data) => active && setLatestCheck(data))
    fetchUpcomingCharter(user.id).then((data) => active && setUpcoming(data))
    return () => {
      active = false
    }
  }, [user.id])

  const missing = latestCheck?.items.filter((i) => i.status === 'missing') ?? []

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-xl font-semibold mb-1">Καλωσόρισες</h1>
      <p className="text-sm text-gray-500 mb-6">{user?.email}</p>

      <Link to="/charters" className="block rounded-xl bg-white shadow-soft border border-gray-100 p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-500 mb-1">Επόμενο charter</h2>
        {upcoming ? (
          <div>
            <p className="text-sm font-medium">
              {new Date(upcoming.start_date).toLocaleDateString('el-GR')} –{' '}
              {new Date(upcoming.end_date).toLocaleDateString('el-GR')}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              {[upcoming.vessel_name, upcoming.company_name].filter(Boolean).join(' · ') || 'Χωρίς επιπλέον στοιχεία'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Δεν υπάρχει προγραμματισμένο charter αυτή τη στιγμή.</p>
        )}
      </Link>

      <Link to="/inventory" className="block rounded-xl bg-white shadow-soft border border-gray-100 p-4">
        <h2 className="text-sm font-medium text-gray-500 mb-1">Εκκρεμότητες inventory</h2>
        {missing.length === 0 ? (
          <p className="text-sm text-gray-400">Δεν υπάρχουν εκκρεμότητες από πρόσφατο έλεγχο.</p>
        ) : (
          <ul className="space-y-0.5">
            {missing.map((i) => (
              <li key={i.id} className="text-sm text-red-600">
                ⚠ {i.item_name}
              </li>
            ))}
          </ul>
        )}
      </Link>
    </div>
  )
}
