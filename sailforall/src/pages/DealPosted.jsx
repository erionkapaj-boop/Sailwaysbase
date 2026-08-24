import { useSearchParams, useParams, Link } from 'react-router-dom'

export default function DealPosted() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const token = params.get('token')
  const manageUrl = `${window.location.origin}/manage/${id}?token=${token}`

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
      <div className="text-4xl mb-3">✅</div>
      <h1 className="text-2xl font-extrabold text-sea-900">Η ευκαιρία δημοσιεύτηκε!</h1>
      <p className="mt-3 text-sm text-gray-500">
        Είναι ήδη ορατή στη λίστα ευκαιριών. Κράτησε τον παρακάτω σύνδεσμο — είναι ο μόνος τρόπος να την
        επεξεργαστείς ή να την αποσύρεις αργότερα, οπότε αποθήκευσέ τον κάπου ασφαλές.
      </p>

      <div className="mt-6 bg-white rounded-2xl shadow-soft p-4 break-all text-sm text-sea-700 font-mono">{manageUrl}</div>

      <div className="mt-4 flex flex-wrap gap-3 justify-center">
        <button
          onClick={() => navigator.clipboard?.writeText(manageUrl)}
          className="bg-sea-700 hover:bg-sea-800 transition text-white font-semibold px-5 py-2.5 rounded-xl"
        >
          Αντιγραφή συνδέσμου
        </button>
        <Link to="/" className="border border-gray-200 hover:bg-gray-50 transition text-gray-700 font-semibold px-5 py-2.5 rounded-xl">
          Πίσω στις ευκαιρίες
        </Link>
      </div>
    </div>
  )
}
