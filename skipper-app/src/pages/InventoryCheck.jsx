import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { fetchItems, saveCheck, seedDefaultItemsIfEmpty } from '../lib/inventoryApi'
import Header from '../components/Header'

export default function InventoryCheck() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [statuses, setStatuses] = useState({}) // itemId -> 'present' | 'missing'
  const [vesselName, setVesselName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    seedDefaultItemsIfEmpty(user.id)
      .then((data) => active && setItems(data))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [user.id])

  function setStatus(itemId, status) {
    setStatuses((prev) => ({ ...prev, [itemId]: prev[itemId] === status ? undefined : status }))
  }

  const missingItems = useMemo(
    () => items.filter((i) => statuses[i.id] === 'missing'),
    [items, statuses]
  )
  const checkedCount = Object.values(statuses).filter(Boolean).length

  async function handleFinish() {
    setSaving(true)
    setError('')
    try {
      const results = items
        .filter((i) => statuses[i.id])
        .map((i) => ({ itemId: i.id, itemName: i.name, status: statuses[i.id] }))
      await saveCheck({ userId: user.id, vesselName, results })
      navigate('/inventory')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="px-4 pt-6 pb-24 text-sm text-gray-400">Φόρτωση…</div>
  }

  return (
    <div className="pb-32">
      <Header title="Νέος Έλεγχος" backTo="/inventory" />

      <div className="px-4">
        <input
          type="text"
          value={vesselName}
          onChange={(e) => setVesselName(e.target.value)}
          placeholder="Σκάφος (προαιρετικό)"
          className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-accent-400"
        />

        {missingItems.length > 0 && (
          <section className="rounded-xl bg-red-50 border border-red-100 p-3 mb-4">
            <h2 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1.5">
              Εκκρεμότητες ({missingItems.length})
            </h2>
            <ul className="space-y-0.5">
              {missingItems.map((i) => (
                <li key={i.id} className="text-sm text-red-700">
                  ⚠ {i.name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="rounded-xl bg-white shadow-soft border border-gray-100 divide-y divide-gray-100 overflow-hidden">
          {items.map((item) => {
            const status = statuses[item.id]
            return (
              <div key={item.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <span className="text-sm flex-1">{item.name}</span>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setStatus(item.id, 'present')}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-base border ${
                      status === 'present'
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'bg-white border-gray-200 text-gray-300'
                    }`}
                    aria-label="Υπάρχει"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setStatus(item.id, 'missing')}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-base border ${
                      status === 'missing'
                        ? 'bg-red-500 border-red-500 text-white'
                        : 'bg-white border-gray-200 text-gray-300'
                    }`}
                    aria-label="Λείπει"
                  >
                    ⚠
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="fixed bottom-16 inset-x-0 max-w-md mx-auto px-4 pb-3">
        <button
          onClick={handleFinish}
          disabled={saving}
          className="w-full rounded-xl bg-accent-500 text-white py-3.5 text-sm font-medium shadow-card disabled:opacity-50"
        >
          {saving ? 'Αποθήκευση…' : `Ολοκλήρωση Ελέγχου (${checkedCount}/${items.length})`}
        </button>
      </div>
    </div>
  )
}
