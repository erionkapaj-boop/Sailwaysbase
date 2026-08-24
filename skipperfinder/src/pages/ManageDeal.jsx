import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { getDealForEdit, updateDeal, removeDeal, uploadDealPhoto } from '../lib/dealsApi'

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sea-300'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  )
}

export default function ManageDeal() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const token = params.get('token')

  const [deal, setDeal] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id || !token) {
      setError('Ο σύνδεσμος διαχείρισης είναι μη έγκυρος.')
      setLoading(false)
      return
    }
    getDealForEdit(id, token)
      .then(row => {
        if (!row) setError('Δεν βρέθηκε καταχώρηση για αυτόν τον σύνδεσμο.')
        else setDeal(row)
      })
      .catch(e => setError(String(e.message || e)))
      .finally(() => setLoading(false))
  }, [id, token])

  const set = patch => setDeal(d => ({ ...d, ...patch }))

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      let photo_url = deal.photo_url
      if (photoFile) photo_url = await uploadDealPhoto(photoFile)
      await updateDeal(id, token, { ...deal, photo_url })
      setNotice('Οι αλλαγές αποθηκεύτηκαν.')
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setSaving(false)
    }
  }

  async function handleStatus(status) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (status === 'removed') {
        await removeDeal(id, token)
        set({ status: 'removed' })
        setNotice('Η καταχώρηση αποσύρθηκε και δεν εμφανίζεται πια στη λίστα.')
      } else {
        await updateDeal(id, token, { ...deal, status })
        set({ status })
        setNotice(status === 'booked' ? 'Η ευκαιρία μαρκαρίστηκε ως κλεισμένη.' : 'Η κατάσταση ενημερώθηκε.')
      }
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-400">Φόρτωση…</div>
  if (error && !deal) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-sm text-red-600">{error}</div>
        <Link to="/" className="inline-block mt-4 text-sea-700 font-semibold">
          Πίσω στην αρχική
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-extrabold text-sea-900">Διαχείριση ευκαιρίας</h1>
      <p className="mt-1 text-sm text-gray-500">{deal.departure_port} → {deal.arrival_port || '—'}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
          Κατάσταση: {{ active: 'ενεργή', booked: 'κλεισμένη', expired: 'έληξε', removed: 'αποσυρμένη' }[deal.status] || deal.status}
        </span>
        {deal.status === 'active' && (
          <button onClick={() => handleStatus('booked')} disabled={saving} className="text-xs font-semibold px-3 py-1 rounded-full bg-sea-100 text-sea-700 hover:bg-sea-200 transition">
            Μαρκάρισμα ως κλεισμένη
          </button>
        )}
        {deal.status !== 'removed' && (
          <button onClick={() => handleStatus('removed')} disabled={saving} className="text-xs font-semibold px-3 py-1 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition">
            Απόσυρση καταχώρησης
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="mt-6 space-y-6">
        <div className="bg-white rounded-2xl shadow-soft p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Επωνυμία εταιρείας">
              <input className={inputClass} value={deal.company_name || ''} onChange={e => set({ company_name: e.target.value })} />
            </Field>
            <Field label="Τηλέφωνο">
              <input className={inputClass} value={deal.contact_phone || ''} onChange={e => set({ contact_phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className={inputClass} value={deal.contact_email || ''} onChange={e => set({ contact_email: e.target.value })} />
            </Field>
            <Field label="Όνομα σκάφους">
              <input className={inputClass} value={deal.boat_name || ''} onChange={e => set({ boat_name: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-soft p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Λιμάνι αναχώρησης">
              <input className={inputClass} value={deal.departure_port || ''} onChange={e => set({ departure_port: e.target.value })} />
            </Field>
            <Field label="Λιμάνι άφιξης">
              <input className={inputClass} value={deal.arrival_port || ''} onChange={e => set({ arrival_port: e.target.value })} />
            </Field>
            <Field label="Ημερομηνία έναρξης">
              <input type="date" className={inputClass} value={deal.trip_start || ''} onChange={e => set({ trip_start: e.target.value })} />
            </Field>
            <Field label="Ημερομηνία λήξης">
              <input type="date" className={inputClass} value={deal.trip_end || ''} onChange={e => set({ trip_end: e.target.value })} />
            </Field>
            <Field label="Τιμή">
              <input type="number" className={inputClass} value={deal.price || ''} onChange={e => set({ price: e.target.value })} />
            </Field>
            <Field label="Κανονική τιμή">
              <input type="number" className={inputClass} value={deal.original_price || ''} onChange={e => set({ original_price: e.target.value })} />
            </Field>
          </div>
          <Field label="Περιγραφή">
            <textarea rows={4} className={inputClass} value={deal.description || ''} onChange={e => set({ description: e.target.value })} />
          </Field>
          <Field label="Νέα φωτογραφία (προαιρετικό)">
            <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} className="text-sm" />
          </Field>
        </div>

        {notice && <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-4 py-3">{notice}</div>}
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>}

        <button
          type="submit"
          disabled={saving}
          className="w-full sm:w-auto bg-sea-700 hover:bg-sea-800 disabled:opacity-60 transition text-white font-semibold px-6 py-3 rounded-xl shadow-soft"
        >
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση αλλαγών'}
        </button>
      </form>
    </div>
  )
}
