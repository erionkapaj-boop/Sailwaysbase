import { Link, NavLink } from 'react-router-dom'

const navLinkClass = ({ isActive }) =>
  `text-sm font-medium px-3 py-2 rounded-lg transition ${
    isActive ? 'bg-sea-50 text-sea-700' : 'text-gray-600 hover:text-sea-700 hover:bg-sea-50'
  }`

export default function Header() {
  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-extrabold text-lg text-sea-900">
          <span className="w-8 h-8 rounded-lg bg-sea-600 text-white flex items-center justify-center text-base">⛵</span>
          SailForAll
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={navLinkClass}>
            Ευκαιρίες
          </NavLink>
          <NavLink to="/post" className="ml-2 text-sm font-semibold px-4 py-2 rounded-lg bg-sun-500 text-white shadow-soft hover:bg-sun-600 transition">
            Καταχώρησε ευκαιρία
          </NavLink>
        </nav>
      </div>
    </header>
  )
}
