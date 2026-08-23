import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { createItem, deleteItem, seedDefaultItemsIfEmpty, updateItem } from '../lib/inventoryApi'
import Header from '../components/Header'

export default function InventoryItems() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')

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

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      const nextOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0
      const item = await createItem(user.id, newName, nextOrder)
      setItems((prev) => [...prev, item])
      setNewName('')
    } catch (err) {
      setError(err.message)
    }
  }

  function startEdit(item) {
    setEditingId(item.id)
    setEditingName(item.name)
  }

  async function saveEdit(id) {
    if (!editingName.trim()) return
    try {
      await updateItem(id, { name: editingName.trim() })
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, name: editingName.trim() } : i)))
      setEditingId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Αφαίρεση αυτού του στοιχείου από το checklist;')) return
    try {
      await deleteItem(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="pb-24">
      <Header title="Στοιχεία Checklist" backTo="/inventory" />

      <div className="px-4">
        <p className="text-sm text-gray-500 mb-4">
          Το προσωπικό σου checklist. Πρόσθεσε, αφαίρεσε ή μετονόμασε στοιχεία όπως θέλεις.
        </p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {loading && <p className="text-sm text-gray-400">Φόρτωση…</p>}

        {!loading && (
          <div className="rounded-xl bg-white shadow-soft border border-gray-100 divide-y divide-gray-100 overflow-hidden mb-4">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-4 py-3">
                {editingId === item.id ? (
                  <>
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit(item.id)}
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
                    />
                    <button onClick={() => saveEdit(item.id)} className="text-sm text-accent-600 font-medium">
                      OK
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{item.name}</span>
                    <button onClick={() => startEdit(item)} className="text-xs text-gray-400">
                      Επεξεργασία
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="text-xs text-red-500">
                      Διαγραφή
                    </button>
                  </>
                )}
              </div>
            ))}
            {items.length === 0 && <p className="px-4 py-6 text-sm text-gray-400 text-center">Δεν υπάρχουν στοιχεία.</p>}
          </div>
        )}

        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Νέο στοιχείο…"
            className="flex-1 rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
          <button type="submit" className="rounded-lg bg-accent-500 text-white px-4 py-3 text-sm font-medium">
            Προσθήκη
          </button>
        </form>
      </div>
    </div>
  )
}
