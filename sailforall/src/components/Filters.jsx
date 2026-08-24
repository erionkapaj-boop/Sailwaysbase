export default function Filters({ value, onChange }) {
  const set = patch => onChange({ ...value, ...patch })

  return (
    <div className="bg-white rounded-2xl shadow-soft p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-500 mb-1">Αναζήτηση (λιμάνι, σκάφος, εταιρεία)</label>
        <input
          type="text"
          value={value.query}
          onChange={e => set({ query: e.target.value })}
          placeholder="π.χ. Λευκάδα, Κατάμαραν…"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sea-300"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Από ημερομηνία</label>
        <input
          type="date"
          value={value.from}
          onChange={e => set({ from: e.target.value })}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sea-300"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Έως ημερομηνία</label>
        <input
          type="date"
          value={value.to}
          onChange={e => set({ to: e.target.value })}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sea-300"
        />
      </div>
      <div className="sm:col-span-4 flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={value.oneWayOnly}
            onChange={e => set({ oneWayOnly: e.target.checked })}
            className="rounded border-gray-300 text-sea-600 focus:ring-sea-300"
          />
          Μόνο μονόδρομες μεταφορές
        </label>
      </div>
    </div>
  )
}
