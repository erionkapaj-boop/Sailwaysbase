export default function Placeholder({ title, description }) {
  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-xl font-semibold mb-2">{title}</h1>
      <p className="text-sm text-gray-500 mb-6">{description}</p>
      <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
        Έρχεται σε επόμενη φάση
      </div>
    </div>
  )
}
