import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createDeal, uploadDealPhoto } from '../lib/dealsApi'

const empty = {
  company_name: '',
  contact_phone: '',
  contact_email: '',
  boat_name: '',
  boat_type: '',
  capacity_cabins: '',
  capacity_berths: '',
  one_way: true,
  departure_port: '',
  arrival_port: '',
  trip_start: '',
  trip_end: '',
  flexible_dates: false,
  price: '',
  original_price: '',
  currency: 'EUR',
  description: '',
  website: '' // honeypot — real users never fill this
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-400 mt-1">{hint}</span>}
    </label>
  )
}

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sea-300'

export default function PostDeal() {
  const [form, setForm] = useState(empty)
  const [photoFile, setPhotoFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const set = patch => setForm(f => ({ ...f, ...patch }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.website) return // honeypot tripped, silently ignore
    if (!form.company_name || !form.departure_port || !form.trip_start) {
      setError('Συμπλήρωσε τουλάχιστον εταιρεία, λιμάνι αναχώρησης και ημερομηνία.')
      return
    }
    if (!form.contact_phone && !form.contact_email) {
      setError('Χρειαζόμαστε τουλάχιστον ένα τηλέφωνο ή email επικοινωνίας.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      let photo_url = ''
      if (photoFile) {
        photo_url = await uploadDealPhoto(photoFile)
      }
      const { website, ...payload } = form
      const created = await createDeal({ ...payload, photo_url })
      if (!created) throw new Error('Η καταχώρηση απέτυχε.')
      navigate(`/posted/${created.id}?token=${created.edit_token}`)
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-extrabold text-sea-900">Καταχώρησε μια ευκαιρία ναύλωσης</h1>
      <p className="mt-2 text-sm text-gray-500">
        Ιδανικό για μονόδρομες μεταφορές (repositioning) και οποιαδήποτε άλλη κενή περίοδο θέλεις να γεμίσεις
        γρήγορα με χαμηλή τιμή. Η καταχώρηση δεν χρειάζεται λογαριασμό — μετά την υποβολή θα πάρεις έναν
        προσωπικό σύνδεσμο για να την επεξεργαστείς ή να την αποσύρεις.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-8">
        <div className="bg-white rounded-2xl shadow-soft p-5 space-y-4">
          <h2 className="text-sm font-bold text-sea-800 uppercase tracking-wide">Στοιχεία εταιρείας</h2>
          <Field label="Επωνυμία εταιρείας *">
            <input className={inputClass} value={form.company_name} onChange={e => set({ company_name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Τηλέφωνο επικοινωνίας">
              <input className={inputClass} value={form.contact_phone} onChange={e => set({ contact_phone: e.target.value })} placeholder="+30 69…" />
            </Field>
            <Field label="Email επικοινωνίας">
              <input type="email" className={inputClass} value={form.contact_email} onChange={e => set({ contact_email: e.target.value })} />
            </Field>
          </div>
          {/* honeypot field, hidden from real users */}
          <input
            type="text"
            value={form.website}
            onChange={e => set({ website: e.target.value })}
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <div className="bg-white rounded-2xl shadow-soft p-5 space-y-4">
          <h2 className="text-sm font-bold text-sea-800 uppercase tracking-wide">Σκάφος</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Όνομα σκάφους">
              <input className={inputClass} value={form.boat_name} onChange={e => set({ boat_name: e.target.value })} />
            </Field>
            <Field label="Τύπος (π.χ. Μονόκορμο, Κατάμαραν)">
              <input className={inputClass} value={form.boat_type} onChange={e => set({ boat_type: e.target.value })} />
            </Field>
            <Field label="Καμπίνες">
              <input type="number" min="0" className={inputClass} value={form.capacity_cabins} onChange={e => set({ capacity_cabins: e.target.value })} />
            </Field>
            <Field label="Κρεβάτια">
              <input type="number" min="0" className={inputClass} value={form.capacity_berths} onChange={e => set({ capacity_berths: e.target.value })} />
            </Field>
          </div>
          <Field label="Φωτογραφία σκάφους">
            <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} className="text-sm" />
          </Field>
        </div>

        <div className="bg-white rounded-2xl shadow-soft p-5 space-y-4">
          <h2 className="text-sm font-bold text-sea-800 uppercase tracking-wide">Διαδρομή &amp; ημερομηνίες</h2>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.one_way} onChange={e => set({ one_way: e.target.checked })} className="rounded border-gray-300 text-sea-600 focus:ring-sea-300" />
            Είναι μονόδρομη μεταφορά (το σκάφος πρέπει να φτάσει στο λιμάνι άφιξης)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Λιμάνι αναχώρησης *">
              <input className={inputClass} value={form.departure_port} onChange={e => set({ departure_port: e.target.value })} required />
            </Field>
            <Field label="Λιμάνι άφιξης">
              <input className={inputClass} value={form.arrival_port} onChange={e => set({ arrival_port: e.target.value })} />
            </Field>
            <Field label="Ημερομηνία έναρξης *">
              <input type="date" className={inputClass} value={form.trip_start} onChange={e => set({ trip_start: e.target.value })} required />
            </Field>
            <Field label="Ημερομηνία λήξης (προθεσμία παράδοσης)">
              <input type="date" className={inputClass} value={form.trip_end} onChange={e => set({ trip_end: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.flexible_dates} onChange={e => set({ flexible_dates: e.target.checked })} className="rounded border-gray-300 text-sea-600 focus:ring-sea-300" />
            Οι ημερομηνίες έχουν κάποια ευελιξία
          </label>
        </div>

        <div className="bg-white rounded-2xl shadow-soft p-5 space-y-4">
          <h2 className="text-sm font-bold text-sea-800 uppercase tracking-wide">Τιμή &amp; περιγραφή</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Τιμή ευκαιρίας">
              <input type="number" min="0" step="1" className={inputClass} value={form.price} onChange={e => set({ price: e.target.value })} />
            </Field>
            <Field label="Κανονική τιμή (προαιρετικό)">
              <input type="number" min="0" step="1" className={inputClass} value={form.original_price} onChange={e => set({ original_price: e.target.value })} />
            </Field>
            <Field label="Νόμισμα">
              <select className={inputClass} value={form.currency} onChange={e => set({ currency: e.target.value })}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </Field>
          </div>
          <Field label="Περιγραφή" hint="Αναφέρετε τυχόν όρους (π.χ. καύσιμα, πληρώματος, κατάθεση εγγύησης).">
            <textarea rows={4} className={inputClass} value={form.description} onChange={e => set({ description: e.target.value })} />
          </Field>
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</div>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto bg-sea-700 hover:bg-sea-800 disabled:opacity-60 transition text-white font-semibold px-6 py-3 rounded-xl shadow-soft"
        >
          {submitting ? 'Καταχώρηση…' : 'Δημοσίευση ευκαιρίας'}
        </button>
      </form>
    </div>
  )
}
