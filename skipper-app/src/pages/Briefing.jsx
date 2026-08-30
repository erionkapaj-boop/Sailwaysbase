import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { fetchBriefing, saveBriefing } from '../lib/briefingApi'
import Header from '../components/Header'

const LANGUAGES = [
  { code: 'el', label: 'Ελληνικά' },
  { code: 'en', label: 'English' }
]

export default function Briefing() {
  const { user } = useAuth()
  const [lang, setLang] = useState('el')
  const [record, setRecord] = useState(null)
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setEditing(false)
    fetchBriefing(user.id, lang)
      .then((data) => {
        if (!active) return
        setRecord(data)
        setContent(data?.content ?? '')
        setTitle(data?.title ?? '')
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [lang, user.id])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const id = await saveBriefing({ id: record?.id, userId: user.id, language: lang, title, content })
      setRecord({ id, language: lang, title, content })
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-24">
      <Header
        title="Briefing"
        action={
          !loading && !editing ? (
            <button onClick={() => setEditing(true)} className="text-sm text-accent-600 font-medium">
              Επεξεργασία
            </button>
          ) : null
        }
      />

      <div className="px-4">
        <div className="flex rounded-lg bg-gray-100 p-1 mb-4">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                lang === l.code ? 'bg-white shadow-soft text-gray-900' : 'text-gray-500'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-gray-400">Φόρτωση…</p>}
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {!loading && editing && (
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Τίτλος (προαιρετικό)"
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={16}
              placeholder="Γράψε εδώ το briefing…"
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-lg bg-accent-500 text-white py-3 text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
              </button>
              <button
                onClick={() => {
                  setEditing(false)
                  setContent(record?.content ?? '')
                  setTitle(record?.title ?? '')
                }}
                className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-500"
              >
                Άκυρο
              </button>
            </div>
          </div>
        )}

        {!loading && !editing && (
          <div className="rounded-xl bg-white shadow-soft border border-gray-100 p-4">
            {title && <h2 className="text-base font-semibold mb-2">{title}</h2>}
            {content ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
            ) : (
              <p className="text-sm text-gray-400">
                Δεν υπάρχει ακόμα briefing στα {LANGUAGES.find((l) => l.code === lang)?.label}. Πάτησε
                «Επεξεργασία» για να το προσθέσεις.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
