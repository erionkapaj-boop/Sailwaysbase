import { Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import BottomNav from './components/BottomNav'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import More from './pages/More'
import Placeholder from './pages/Placeholder'
import Contacts from './pages/Contacts'
import ContactForm from './pages/ContactForm'

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
        <Route
          path="/briefing"
          element={<Placeholder title="Customer Briefing" description="Briefing πελατών στα Ελληνικά και Αγγλικά." />}
        />
        <Route
          path="/calendar"
          element={<Placeholder title="Ημερολόγιο" description="Κρατήσεις, ναυλώσεις και διαθεσιμότητα." />}
        />
        <Route
          path="/inventory"
          element={<Placeholder title="Inventory / Checklist" description="Προσωπικό checklist σκάφους." />}
        />
        <Route
          path="/availability"
          element={<Placeholder title="Διαθεσιμότητα" description="Περίοδοι διαθεσιμότητας και τιμές ανά ημέρα." />}
        />
        <Route
          path="/charters"
          element={<Placeholder title="Ναυλώσεις / Charters" description="Πλήρης φάκελος κάθε charter." />}
        />
        <Route
          path="/pricing"
          element={<Placeholder title="Τιμές" description="Τιμοκατάλογος ανά περίοδο." />}
        />
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
