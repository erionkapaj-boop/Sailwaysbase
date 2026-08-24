import { formatDateRange, formatPrice, discountPercent, nightsBetween } from '../lib/format'

export default function DealCard({ deal }) {
  const price = formatPrice(deal.price, deal.currency)
  const original = formatPrice(deal.original_price, deal.currency)
  const off = discountPercent(deal.price, deal.original_price)
  const nights = nightsBetween(deal.trip_start, deal.trip_end)

  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden flex flex-col">
      <div className="relative h-40 bg-sea-100">
        {deal.photo_url ? (
          <img src={deal.photo_url} alt={deal.boat_name || 'Σκάφος'} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">⛵</div>
        )}
        <div className="absolute top-2 left-2 flex gap-1.5">
          {deal.one_way && (
            <span className="text-xs font-semibold bg-sea-900/85 text-white px-2 py-1 rounded-full">Μονόδρομη μεταφορά</span>
          )}
          {off && <span className="text-xs font-semibold bg-sun-500 text-white px-2 py-1 rounded-full">-{off}%</span>}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <span>{deal.departure_port}</span>
          {deal.arrival_port && (
            <>
              <span className="text-gray-300">→</span>
              <span>{deal.arrival_port}</span>
            </>
          )}
        </div>

        <div className="text-xs text-gray-500">
          {formatDateRange(deal.trip_start, deal.trip_end)}
          {nights ? ` · ${nights} ${nights === 1 ? 'ημέρα' : 'ημέρες'}` : ''}
          {deal.flexible_dates ? ' · ευέλικτες ημερομηνίες' : ''}
        </div>

        {(deal.boat_name || deal.boat_type) && (
          <div className="text-sm text-gray-700">
            {[deal.boat_name, deal.boat_type].filter(Boolean).join(' · ')}
          </div>
        )}

        {(deal.capacity_cabins || deal.capacity_berths) && (
          <div className="text-xs text-gray-400">
            {deal.capacity_cabins ? `${deal.capacity_cabins} καμπίνες` : ''}
            {deal.capacity_cabins && deal.capacity_berths ? ' · ' : ''}
            {deal.capacity_berths ? `${deal.capacity_berths} κρεβάτια` : ''}
          </div>
        )}

        {deal.description && <p className="text-sm text-gray-600 line-clamp-3">{deal.description}</p>}

        <div className="mt-auto pt-2 flex items-end justify-between">
          <div>
            {price ? (
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-sea-900">{price}</span>
                {original && <span className="text-xs text-gray-400 line-through">{original}</span>}
              </div>
            ) : (
              <span className="text-sm text-gray-400">Τιμή κατόπιν επικοινωνίας</span>
            )}
          </div>
          <span className="text-xs text-gray-400">{deal.company_name}</span>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {deal.contact_phone && (
            <a
              href={`tel:${deal.contact_phone.replace(/\s+/g, '')}`}
              className="flex-1 text-center text-sm font-semibold bg-sea-700 text-white rounded-lg px-3 py-2 hover:bg-sea-800 transition"
            >
              Κλήση
            </a>
          )}
          {deal.contact_email && (
            <a
              href={`mailto:${deal.contact_email}?subject=${encodeURIComponent('Ενδιαφέρον για ναύλο: ' + deal.departure_port)}`}
              className="flex-1 text-center text-sm font-semibold border border-sea-200 text-sea-700 rounded-lg px-3 py-2 hover:bg-sea-50 transition"
            >
              Email
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
