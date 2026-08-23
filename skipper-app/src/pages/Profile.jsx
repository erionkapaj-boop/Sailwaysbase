import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/AuthContext'

function calculateAge(birthDate) {
  if (!birthDate) return null
  const today = new Date()
  const dob = new Date(birthDate)
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1
  }
  return age
}

const GENDER_OPTIONS = [
  { value: '', label: '—' },
  { value: 'male', label: 'Άνδρας' },
  { value: 'female', label: 'Γυναίκα' },
  { value: 'other', label: 'Άλλο' }
]

export default function Profile() {
  const { user, signOut } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ full_name: '', photo_url: '', birth_date: '', gender: '' })

  useEffect(() => {
    let active = true
    async function load() {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('full_name, photo_url, birth_date, gender')
        .eq('id', user.id)
        .maybeSingle()
      if (!active) return
      if (fetchError) {
        setError(fetchError.message)
      } else if (data) {
        setForm({
          full_name: data.full_name ?? '',
          photo_url: data.photo_url ?? '',
          birth_date: data.birth_date ?? '',
          gender: data.gender ?? ''
        })
      }
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [user.id])

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    const path = `${user.id}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) {
      setError(uploadError.message)
      return
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    setForm((f) => ({ ...f, photo_url: data.publicUrl }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: form.full_name || null,
      photo_url: form.photo_url || null,
      birth_date: form.birth_date || null,
      gender: form.gender || null,
      updated_at: new Date().toISOString()
    })
    setSaving(false)
    if (upsertError) {
      setError(upsertError.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  if (loading) {
    return <div className="px-4 pt-6 pb-24 text-sm text-gray-400">Φόρτωση…</div>
  }

  const age = calculateAge(form.birth_date)

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-xl font-semibold mb-1">Προφίλ</h1>
      <p className="text-sm text-gray-500 mb-6">{user.email}</p>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
            {form.photo_url ? (
              <img src={form.photo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">Φωτό</div>
            )}
          </div>
          <label className="text-sm text-accent-600 font-medium cursor-pointer">
            Αλλαγή φωτογραφίας
            <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ονοματεπώνυμο</label>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            placeholder="π.χ. Γιάννης Παπαδόπουλος"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ημερομηνία γέννησης</label>
          <input
            type="date"
            value={form.birth_date}
            onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
          {age !== null && <p className="text-xs text-gray-400 mt-1">Ηλικία: {age} ετών</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Φύλο</label>
          <select
            value={form.gender}
            onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white"
          >
            {GENDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">Αποθηκεύτηκε.</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-accent-500 text-white py-3 text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
      </form>

      <button onClick={signOut} className="mt-8 text-sm text-gray-400">
        Αποσύνδεση
      </button>
    </div>
  )
}
