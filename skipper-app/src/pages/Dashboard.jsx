import { useAuth } from '../lib/AuthContext'

export default function Dashboard() {
  const { user } = useAuth()

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-xl font-semibold mb-1">Καλωσόρισες</h1>
      <p className="text-sm text-gray-500 mb-6">{user?.email}</p>

      <section className="rounded-xl bg-white shadow-soft border border-gray-100 p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-500 mb-1">Επόμενο charter</h2>
        <p className="text-sm text-gray-400">Δεν υπάρχει προγραμματισμένο charter αυτή τη στιγμή.</p>
      </section>

      <section className="rounded-xl bg-white shadow-soft border border-gray-100 p-4">
        <h2 className="text-sm font-medium text-gray-500 mb-1">Εκκρεμότητες inventory</h2>
        <p className="text-sm text-gray-400">Δεν υπάρχουν εκκρεμότητες από πρόσφατο έλεγχο.</p>
      </section>
    </div>
  )
}
