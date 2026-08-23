import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchContacts, fetchTags } from '../lib/contactsApi'
import Header from '../components/Header'

function matchesText(contact, query) {
  if (!query) return true
  const q = query.toLowerCase()
  const haystacks = [
    contact.name,
    contact.company,
    ...contact.roles.map((r) => r.name),
    ...contact.ports.map((p) => p.name)
  ]
  return haystacks.some((h) => h && h.toLowerCase().includes(q))
}

export default function Contacts() {
  const [contacts, setContacts] = useState([])
  const [roleOptions, setRoleOptions] = useState([])
  const [portOptions, setPortOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeRoles, setActiveRoles] = useState([])
  const [activePorts, setActivePorts] = useState([])

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [contactRows, roles, ports] = await Promise.all([
          fetchContacts(),
          fetchTags('contact_roles'),
          fetchTags('contact_ports')
        ])
        if (!active) return
        setContacts(contactRows)
        setRoleOptions(roles)
        setPortOptions(ports)
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
  }, [])

  function toggle(list, setList, name) {
    setList(list.includes(name) ? list.filter((n) => n !== name) : [...list, name])
  }

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (!matchesText(c, search)) return false
      if (activeRoles.length > 0 && !c.roles.some((r) => activeRoles.includes(r.name))) return false
      if (activePorts.length > 0 && !c.ports.some((p) => activePorts.includes(p.name))) return false
      return true
    })
  }, [contacts, search, activeRoles, activePorts])

  const groups = useMemo(() => {
    const map = new Map()
    for (const c of filtered) {
      const key = c.company?.trim() || 'Χωρίς εταιρεία'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(c)
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === 'Χωρίς εταιρεία') return 1
      if (b === 'Χωρίς εταιρεία') return -1
      return a.localeCompare(b, 'el')
    })
  }, [filtered])

  return (
    <div className="pb-24">
      <Header
        title="Επαφές"
        action={
          <Link
            to="/contacts/new"
            className="w-9 h-9 rounded-full bg-accent-500 text-white flex items-center justify-center text-xl leading-none"
            aria-label="Νέα επαφή"
          >
            +
          </Link>
        }
      />

      <div className="px-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Αναζήτηση σε όνομα, εταιρεία, ρόλο, λιμάνι…"
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
        />

        {(roleOptions.length > 0 || portOptions.length > 0) && (
          <div className="mt-3 space-y-2">
            {roleOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {roleOptions.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => toggle(activeRoles, setActiveRoles, r.name)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border ${
                      activeRoles.includes(r.name)
                        ? 'bg-accent-500 border-accent-500 text-white'
                        : 'bg-white border-gray-200 text-gray-500'
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
            {portOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {portOptions.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => toggle(activePorts, setActivePorts, p.name)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border ${
                      activePorts.includes(p.name)
                        ? 'bg-accent-900 border-accent-900 text-white'
                        : 'bg-white border-gray-200 text-gray-500'
                    }`}
                  >
                    ⚓ {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-4 mt-5 space-y-6">
        {loading && <p className="text-sm text-gray-400">Φόρτωση…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && groups.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">
            {contacts.length === 0 ? 'Δεν υπάρχουν επαφές ακόμα.' : 'Δεν βρέθηκαν επαφές.'}
          </p>
        )}

        {groups.map(([company, items]) => (
          <section key={company}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{company}</h2>
            <div className="rounded-xl bg-white shadow-soft border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {items.map((c) => (
                <Link key={c.id} to={`/contacts/${c.id}`} className="block px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{c.name}</span>
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-accent-600 text-sm shrink-0"
                      >
                        ☎ {c.phone}
                      </a>
                    )}
                  </div>
                  {(c.roles.length > 0 || c.ports.length > 0) && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {c.roles.map((r) => (
                        <span key={r.id} className="text-[11px] rounded-full bg-accent-50 text-accent-700 px-2 py-0.5">
                          {r.name}
                        </span>
                      ))}
                      {c.ports.map((p) => (
                        <span key={p.id} className="text-[11px] rounded-full bg-gray-100 text-gray-500 px-2 py-0.5">
                          ⚓ {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
