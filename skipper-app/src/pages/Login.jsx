import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithOtp({ email })
    setLoading(false)
    if (signInError) {
      setError(signInError.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-1">Skipper App</h1>
        <p className="text-sm text-gray-500 mb-6">Σύνδεση με email (magic link)</p>

        {sent ? (
          <p className="text-sm text-gray-700">
            Στείλαμε ένα link σύνδεσης στο <strong>{email}</strong>. Άνοιξέ το από το κινητό σου.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-accent-500 text-white py-3 text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Αποστολή…' : 'Αποστολή link σύνδεσης'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
