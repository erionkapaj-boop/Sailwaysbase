import { useEffect, useState } from 'react'
import { getCharterPhotoUrl } from '../lib/chartersApi'

export default function PhotoThumb({ path, caption, onDelete }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let active = true
    getCharterPhotoUrl(path)
      .then((u) => active && setUrl(u))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [path])

  return (
    <div className="relative w-24 shrink-0">
      <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-100">
        {url ? (
          <img src={url} alt={caption ?? ''} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full animate-pulse bg-gray-100" />
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center"
            aria-label="Διαγραφή φωτογραφίας"
          >
            ×
          </button>
        )}
      </div>
      {caption && <p className="text-[11px] text-gray-500 mt-1 truncate">{caption}</p>}
    </div>
  )
}
