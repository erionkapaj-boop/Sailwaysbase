import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchLatestCheck } from '../lib/inventoryApi'
import Header from '../components/Header'

export default function Inventory() {
  const { user } = useAuth()
  const [latest, setLatest] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchLatestCheck(user.id)
      .then((data) => active && setLatest(data))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [user.id])

  const missing = latest?.items.filter((i) => i.status === 'missing') ?? []

  return (
    <div className="pb-24">
      <Header title="Inventory / Checklist" />

      <div className="px-4 space-y-4">
        <Link
          to="/inventory/check"
          className="block rounded-xl bg-accent-500 text-white text-center py-4 text-sm font-medium shadow-soft"
        >
          Νέος Έλεγχος
        </Link>

        <Link
          to="/inventory/items"
          className="block rounded-xl bg-white border border-gray-100 text-center py-3.5 text-sm font-medium text-gray-700 shadow-soft"
        >
          Διαχείριση στοιχείων checklist
        </Link>

        {!loading && latest && (
          <section className="rounded-xl bg-white shadow-soft border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-gray-500">Τελευταίος έλεγχος</h2>
              <span className="text-xs text-gray-400">
                {new Date(latest.closed_at ?? latest.started_at).toLocaleDateString('el-GR')}
              </span>
            </div>
            {latest.vessel_name && <p className="text-sm mb-2">Σκάφος: {latest.vessel_name}</p>}
            {missing.length === 0 ? (
              <p className="text-sm text-gray-400">Όλα εντάξει, τίποτα δεν έλειπε.</p>
            ) : (
              <ul className="space-y-1">
                {missing.map((i) => (
                  <li key={i.id} className="text-sm text-red-600 flex items-center gap-1.5">
                    <span>⚠</span> {i.item_name}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
