import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import BottomNav from './components/BottomNav'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import More from './pages/More'
import Placeholder from './pages/Placeholder'
import Contacts from './pages/Contacts'
import ContactForm from './pages/ContactForm'
import Briefing from './pages/Briefing'
import Inventory from './pages/Inventory'
import InventoryItems from './pages/InventoryItems'
import InventoryCheck from './pages/InventoryCheck'
import Calendar from './pages/Calendar'
import PeriodForm from './pages/PeriodForm'

function AppShell() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Φόρτωση…</div>
  }

  if (!user) {
    return <Login />
  }

  return (
    <div className="min-h-screen max-w-md mx-auto bg-[#f7f7f8]">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/contacts/new" element={<ContactForm />} />
        <Route path="/contacts/:id" element={<ContactForm />} />
        <Route path="/briefing" element={<Briefing />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/calendar/new" element={<PeriodForm />} />
        <Route path="/calendar/:id" element={<PeriodForm />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/inventory/items" element={<InventoryItems />} />
        <Route path="/inventory/check" element={<InventoryCheck />} />
        <Route path="/availability" element={<Navigate to="/calendar" replace />} />
        <Route
          path="/charters"
          element={<Placeholder title="Ναυλώσεις / Charters" description="Πλήρης φάκελος κάθε charter." />}
        />
        <Route path="/pricing" element={<Navigate to="/calendar" replace />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/more" element={<More />} />
      </Routes>
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
