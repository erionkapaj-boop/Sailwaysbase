import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { deleteCharter, fetchCharter, saveCharter } from '../lib/chartersApi'
import { fetchContacts } from '../lib/contactsApi'
import { fetchPeriods } from '../lib/availabilityApi'
import Header from '../components/Header'

export default function CharterForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    startDate: '',
    endDate: '',
    vesselName: '',
    companyName: '',
    companyContactId: '',
    fee: '',
    notes: ''
  })
  const [contacts, setContacts] = useState([])
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [contactRows, periodRows] = await Promise.all([fetchContacts(), fetchPeriods(user.id)])
        if (!active) return
        setContacts(contactRows.filter((c) => c.company))
        setPeriods(periodRows)

        if (isEdit) {
          const charter = await fetchCharter(id)
          if (!active) return
          if (!charter) {
            setError('Το charter δεν βρέθηκε.')
          } else {
            setForm({
              startDate: charter.start_date,
              endDate: charter.end_date,
              vesselName: charter.vessel_name ?? '',
              companyName: charter.company_name ?? '',
              companyContactId: charter.company_contact_id ?? '',
              fee: charter.fee ?? '',
              notes: charter.notes ?? ''
            })
          }
        }
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [id, isEdit, user.id])

  const companyOptions = [...new Set(contacts.map((c) => c.company))].sort((a, b) => a.localeCompare(b, 'el'))
  const knownCompany = form.companyName && companyOptions.some((c) => c.toLowerCase() === form.companyName.toLowerCase())

  function handleCompanyChange(value) {
    const match = contacts.find((c) => c.company?.toLowerCase() === value.toLowerCase())
    setForm((f) => ({ ...f, companyName: value, companyContactId: match?.id ?? '' }))
  }

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
      const coveringPeriod = periods.find(
        (p) => p.is_available && p.start_date <= form.startDate && p.end_date >= form.endDate
      )
      await saveCharter({
        id: isEdit ? id : undefined,
        userId: user.id,
        startDate: form.startDate,
        endDate: form.endDate,
        vesselName: form.vesselName,
        companyContactId: form.companyContactId || null,
        companyName: form.companyName,
        fee: form.fee,
        notes: form.notes,
        availabilityPeriodId: coveringPeriod?.id ?? null
      })
      navigate(isEdit ? `/charters/${id}` : '/charters')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Διαγραφή αυτού του charter (μαζί με προβλήματα, πελάτες και φωτογραφίες του);')) return
    setSaving(true)
    try {
      await deleteCharter(id)
      navigate('/charters')
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
      <Header title={isEdit ? 'Επεξεργασία charter' : 'Νέο charter'} backTo={isEdit ? `/charters/${id}` : '/charters'} />

      <form onSubmit={handleSubmit} className="px-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Από *</label>
            <input
              type="date"
              required
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Έως *</label>
            <input
              type="date"
              required
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Σκάφος</label>
          <input
            type="text"
            value={form.vesselName}
            onChange={(e) => setForm((f) => ({ ...f, vesselName: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Εταιρεία</label>
          <input
            type="text"
            list="charter-company-suggestions"
            value={form.companyName}
            onChange={(e) => handleCompanyChange(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            placeholder="π.χ. Trimis Yachting"
          />
          <datalist id="charter-company-suggestions">
            {companyOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {form.companyName && !knownCompany && (
            <p className="text-xs text-gray-400 mt-1">
              Νέα εταιρεία — θέλεις να την{' '}
              <Link to="/contacts/new" className="text-accent-600 font-medium">
                προσθέσεις στις Επαφές
              </Link>
              ;
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Αμοιβή (€)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={form.fee}
            onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
        </div>

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
            Διαγραφή charter
          </button>
        )}
      </form>
    </div>
  )
}
