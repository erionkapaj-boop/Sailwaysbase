import { useEffect, useState } from 'react'

export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (online) return null

  return (
    <div className="bg-gray-900 text-white text-xs text-center py-1.5">
      Είσαι εκτός σύνδεσης — βλέπεις τα τελευταία αποθηκευμένα δεδομένα. Νέες αλλαγές δεν θα αποθηκευτούν μέχρι να επανέλθει η σύνδεση.
    </div>
  )
}
