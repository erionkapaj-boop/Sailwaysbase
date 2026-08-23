import { useNavigate } from 'react-router-dom'

export default function Header({ title, backTo, action }) {
  const navigate = useNavigate()
  return (
    <div className="sticky top-0 z-10 bg-[#f7f7f8]/95 backdrop-blur px-4 pt-6 pb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {backTo && (
          <button
            onClick={() => navigate(backTo)}
            aria-label="Πίσω"
            className="w-8 h-8 -ml-2 flex items-center justify-center text-gray-500 text-lg"
          >
            ‹
          </button>
        )}
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>
      {action}
    </div>
  )
}
