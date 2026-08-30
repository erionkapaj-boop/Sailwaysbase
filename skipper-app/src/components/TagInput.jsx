import { useMemo, useRef, useState } from 'react'

// Reusable multi-select autocomplete tag input. Value/onChange work with
// plain tag name strings so it can be used for any reusable-tag field
// (contact roles, ports, ...) without depending on how ids get created.
export default function TagInput({ label, value, onChange, suggestions = [], placeholder }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)

  const filteredSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    return suggestions
      .filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()))
      .filter((s) => !q || s.toLowerCase().includes(q))
      .slice(0, 8)
  }, [suggestions, value, query])

  function addTag(name) {
    const clean = name.trim()
    if (!clean) return
    if (value.some((v) => v.toLowerCase() === clean.toLowerCase())) {
      setQuery('')
      return
    }
    onChange([...value, clean])
    setQuery('')
    setOpen(false)
  }

  function removeTag(name) {
    onChange(value.filter((v) => v !== name))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (query.trim()) addTag(query)
    } else if (e.key === 'Backspace' && !query && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  const showCreateOption = query.trim() && !suggestions.some((s) => s.toLowerCase() === query.trim().toLowerCase())

  return (
    <div>
      {label && <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>}
      <div className="rounded-lg border border-gray-200 px-2 py-2 focus-within:ring-2 focus-within:ring-accent-400">
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-accent-50 text-accent-700 text-xs font-medium px-2.5 py-1"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-accent-400 hover:text-accent-600"
                aria-label={`Αφαίρεση ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[80px] text-sm px-1 py-1 outline-none"
          />
        </div>
      </div>

      {open && (filteredSuggestions.length > 0 || showCreateOption) && (
        <div className="mt-1 rounded-lg border border-gray-100 bg-white shadow-card overflow-hidden">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(s)}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
            >
              {s}
            </button>
          ))}
          {showCreateOption && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(query)}
              className="block w-full text-left px-3 py-2 text-sm text-accent-600 hover:bg-accent-50"
            >
              + Δημιουργία «{query.trim()}»
            </button>
          )}
        </div>
      )}
    </div>
  )
}
