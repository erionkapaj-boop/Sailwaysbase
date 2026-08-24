import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listActiveDeals } from '../lib/dealsApi'
import DealCard from '../components/DealCard'
import Filters from '../components/Filters'
import EmptyState from '../components/EmptyState'

export default function Home() {
  const [filters, setFilters] = useState({ query: '', from: '', to: '', oneWayOnly: false })
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    listActiveDeals(filters)
      .then(rows => {
        if (!cancelled) setDeals(rows)
      })
      .catch(e => {
        if (!cancelled) setError(String(e.message || e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters.query, filters.from, filters.to, filters.oneWayOnly])

  return (
    <div>
      <section className="bg-gradient-to-b from-sea-900 to-sea-700 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <h1 className="text-3xl sm:text-4xl font-extrabold max-w-2xl leading-tight">
            Φθηνά ναύλα ευκαιρίας σε ιστιοπλοϊκά — όπου κι αν προκύψουν
          </h1>
          <p className="mt-4 text-sea-100 max-w-2xl">
            Ναυλομεσιτικές εταιρείες που έχουν ένα σκάφος «στη λάθος μαρίνα» και βιάζονται να το φέρουν πίσω,
            δημοσιεύουν εδώ την ευκαιρία τους. Δεν ψάχνεις συγκεκριμένο προορισμό — απλά βλέπεις τι υπάρχει
            διαθέσιμο τώρα, πολύ φθηνά.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/post" className="bg-sun-500 hover:bg-sun-600 transition text-white font-semibold px-5 py-3 rounded-xl shadow-soft">
              Έχεις εταιρεία; Καταχώρησε ευκαιρία
            </Link>
            <a href="#deals" className="bg-white/10 hover:bg-white/20 transition text-white font-semibold px-5 py-3 rounded-xl">
              Δες τις ευκαιρίες
            </a>
          </div>
        </div>
      </section>

      <section id="deals" className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <Filters value={filters} onChange={setFilters} />

        <div className="mt-6">
          {loading && <EmptyState title="Φόρτωση ευκαιριών…" />}
          {!loading && error && <EmptyState title="Κάτι πήγε στραβά" subtitle={error} />}
          {!loading && !error && deals.length === 0 && (
            <EmptyState title="Δεν υπάρχουν ευκαιρίες αυτή τη στιγμή" subtitle="Ξαναδοκίμασε σε λίγο ή άλλαξε τα φίλτρα." />
          )}
          {!loading && !error && deals.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {deals.map(deal => (
                <DealCard key={deal.id} deal={deal} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
