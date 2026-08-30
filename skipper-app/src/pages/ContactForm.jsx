import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { deleteContact, fetchContact, fetchContacts, fetchTags, saveContact } from '../lib/contactsApi'
import Header from '../components/Header'
import TagInput from '../components/TagInput'

const EMPTY_FORM = { name: '', company: '', phone: '', email: '', notes: '', roles: [], ports: [] }

export default function ContactForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState(EMPTY_FORM)
  const [companies, setCompanies] = useState([])
  const [roleSuggestions, setRoleSuggestions] = useState([])
  const [portSuggestions, setPortSuggestions] = useState([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [allContacts, roles, ports] = await Promise.all([
          fetchContacts(),
          fetchTags('contact_roles'),
          fetchTags('contact_ports')
        ])
        if (!active) return
        setCompanies([...new Set(allContacts.map((c) => c.company).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el')))
        setRoleSuggestions(roles.map((r) => r.name))
        setPortSuggestions(ports.map((p) => p.name))

        if (isEdit) {
          const contact = await fetchContact(id)
          if (!active) return
          if (!contact) {
            setError('Η επαφή δεν βρέθηκε.')
          } else {
            setForm({
              name: contact.name ?? '',
              company: contact.company ?? '',
              phone: contact.phone ?? '',
              email: contact.email ?? '',
              notes: contact.notes ?? '',
              roles: contact.roles.map((r) => r.name),
              ports: contact.ports.map((p) => p.name)
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
  }, [id, isEdit])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Το όνομα είναι υποχρεωτικό.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveContact({
        id: isEdit ? id : undefined,
        userId: user.id,
        name: form.name,
        company: form.company,
        phone: form.phone,
        email: form.email,
        notes: form.notes,
        roleNames: form.roles,
        portNames: form.ports
      })
      navigate('/contacts')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Διαγραφή αυτής της επαφής;')) return
    setSaving(true)
    try {
      await deleteContact(id)
      navigate('/contacts')
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
      <Header title={isEdit ? 'Επεξεργασία επαφής' : 'Νέα επαφή'} backTo="/contacts" />

      <form onSubmit={handleSubmit} className="px-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Όνομα *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            placeholder="π.χ. Μαρία Νικολάου"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Εταιρεία</label>
          <input
            type="text"
            list="company-suggestions"
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            placeholder="π.χ. Trimis Yachting"
          />
          <datalist id="company-suggestions">
            {companies.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Τηλέφωνο</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            placeholder="+30 69…"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
        </div>

        <TagInput
          label="Ρόλοι"
          value={form.roles}
          onChange={(roles) => setForm((f) => ({ ...f, roles }))}
          suggestions={roleSuggestions}
          placeholder="π.χ. Base Manager, Γραμματεία…"
        />

        <TagInput
          label="Λιμάνια"
          value={form.ports}
          onChange={(ports) => setForm((f) => ({ ...f, ports }))}
          suggestions={portSuggestions}
          placeholder="π.χ. Λευκάδα, Λαύριο…"
        />

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
            Διαγραφή επαφής
          </button>
        )}
      </form>
    </div>
  )
}
