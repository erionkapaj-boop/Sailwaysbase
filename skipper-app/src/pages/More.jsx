import { Link } from 'react-router-dom'

const ITEMS = [
  { to: '/inventory', label: 'Inventory / Checklist' },
  { to: '/availability', label: 'Διαθεσιμότητα' },
  { to: '/charters', label: 'Ναυλώσεις / Charters' },
  { to: '/pricing', label: 'Τιμές' },
  { to: '/profile', label: 'Προφίλ & Ρυθμίσεις' }
]

export default function More() {
  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-xl font-semibold mb-4">Περισσότερα</h1>
      <div className="rounded-xl bg-white shadow-soft border border-gray-100 divide-y divide-gray-100 overflow-hidden">
        {ITEMS.map((item) => (
          <Link key={item.to} to={item.to} className="flex items-center justify-between px-4 py-4 text-sm">
            {item.label}
            <span className="text-gray-300">›</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
