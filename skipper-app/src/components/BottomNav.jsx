import { NavLink } from 'react-router-dom'

const PRIMARY_TABS = [
  { to: '/', label: 'Αρχική', icon: '⌂' },
  { to: '/contacts', label: 'Επαφές', icon: '☎' },
  { to: '/briefing', label: 'Briefing', icon: '📋' },
  { to: '/calendar', label: 'Ημερολόγιο', icon: '📅' },
  { to: '/more', label: 'Περισσότερα', icon: '⋯' }
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-md mx-auto grid grid-cols-5">
        {PRIMARY_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] ${
                isActive ? 'text-accent-600' : 'text-gray-400'
              }`
            }
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
