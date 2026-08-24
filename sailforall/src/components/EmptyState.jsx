export default function EmptyState({ title, subtitle }) {
  return (
    <div className="text-center py-16">
      <div className="text-4xl mb-3">🔍</div>
      <div className="text-base font-semibold text-gray-700">{title}</div>
      {subtitle && <div className="text-sm text-gray-400 mt-1">{subtitle}</div>}
    </div>
  )
}
