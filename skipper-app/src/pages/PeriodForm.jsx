import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { deletePeriod, fetchPeriod, savePeriod } from '../lib/availabilityApi'
import Header from '../components/Header'

export default function PeriodForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({
    startDate: location.state?.startDate ?? '',
    endDate: location.state?.endDate ?? '',
    isAvailable: true,
    pricePerDay: '',
    notes: ''
  })
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isEdit) return
    let active = true
    fetchPeriod(id)
      .then((p) => {
        if (!active || !p) return
        setForm({
          startDate: p.start_date,
          endDate: p.end_date,
          isAvailable: p.is_available,
          pricePerDay: p.price_per_day ?? '',
          notes: p.notes ?? ''
        })
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [id, isEdit])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.startDate || !form.endDate) {
      setError('Συμπλήρωσε ημερομηνία έναρξης και λήξης.')
      return
    }
    if (form.endDate < form.startDate) {
      setError('Η λήξη δεν μπορεί να είναι πριν την έναρξη.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await savePeriod({
        id: isEdit ? id : undefined,
        userId: user.id,
        startDate: form.startDate,
        endDate: form.endDate,
        isAvailable: form.isAvailable,
        pricePerDay: form.isAvailable ? form.pricePerDay : '',
        notes: form.notes
      })
      navigate('/calendar')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Διαγραφή αυτής της περιόδου;')) return
    setSaving(true)
    try {
      await deletePeriod(id)
      navigate('/calendar')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="px-4 pt-6 pb-24 text-sm text-gray-400">Φόρτωση…</div>
  }

  return (
    <div className="pb-24">
      <Header title={isEdit ? 'Επεξεργασία περιόδου' : 'Νέα περίοδος'} backTo="/calendar" />

      <form onSubmit={handleSubmit} className="px-4 space-y-4">
        <div className="flex rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, isAvailable: true }))}
            className={`flex-1 rounded-md py-2 text-sm font-medium ${
              form.isAvailable ? 'bg-white shadow-soft text-gray-900' : 'text-gray-500'
            }`}
          >
            Διαθέσιμος
          </button>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, isAvailable: false }))}
            className={`flex-1 rounded-md py-2 text-sm font-medium ${
              !form.isAvailable ? 'bg-white shadow-soft text-gray-900' : 'text-gray-500'
            }`}
          >
            Μη διαθέσιμος
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Από</label>
            <input
              type="date"
              required
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Έως</label>
            <input
              type="date"
              required
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
          </div>
        </div>

        {form.isAvailable && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Τιμή ανά ημέρα (€)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.pricePerDay}
              onChange={(e) => setForm((f) => ({ ...f, pricePerDay: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
              placeholder="π.χ. 220"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Σημειώσεις</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-accent-500 text-white py-3 text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>

        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="w-full text-center text-sm text-red-600 py-2"
          >
            Διαγραφή περιόδου
          </button>
        )}
      </form>
    </div>
  )
}
