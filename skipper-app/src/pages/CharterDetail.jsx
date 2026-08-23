import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  addCustomer,
  addExperiencePhoto,
  addProblem,
  addProblemPhoto,
  deleteCustomer,
  deleteExperiencePhoto,
  deleteProblem,
  deleteProblemPhoto,
  fetchCharter,
  uploadCharterPhoto
} from '../lib/chartersApi'
import { fetchCheckForCharter } from '../lib/inventoryApi'
import Header from '../components/Header'
import PhotoThumb from '../components/PhotoThumb'

export default function CharterDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [charter, setCharter] = useState(null)
  const [checkIn, setCheckIn] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newProblem, setNewProblem] = useState('')
  const [newCustomer, setNewCustomer] = useState({ fullName: '', phone: '', notes: '' })
  const [uploadingProblemId, setUploadingProblemId] = useState(null)
  const [uploadingExperience, setUploadingExperience] = useState(false)
  const problemPhotoInputs = useRef({})
  const experiencePhotoInput = useRef(null)

  async function reload() {
    const [c, ci] = await Promise.all([fetchCharter(id), fetchCheckForCharter(id)])
    setCharter(c)
    setCheckIn(ci)
  }

  useEffect(() => {
    let active = true
    reload()
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleAddProblem(e) {
    e.preventDefault()
    if (!newProblem.trim()) return
    try {
      const problem = await addProblem(id, newProblem)
      setCharter((c) => ({ ...c, problems: [problem, ...c.problems] }))
      setNewProblem('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteProblem(problemId) {
    if (!window.confirm('Διαγραφή αυτού του προβλήματος;')) return
    try {
      await deleteProblem(problemId)
      setCharter((c) => ({ ...c, problems: c.problems.filter((p) => p.id !== problemId) }))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleProblemPhoto(problemId, file) {
    if (!file) return
    setUploadingProblemId(problemId)
    try {
      const path = await uploadCharterPhoto(user.id, id, file)
      const photo = await addProblemPhoto(problemId, path)
      setCharter((c) => ({
        ...c,
        problems: c.problems.map((p) => (p.id === problemId ? { ...p, photos: [...p.photos, photo] } : p))
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingProblemId(null)
    }
  }

  async function handleDeleteProblemPhoto(problemId, photoId) {
    try {
      await deleteProblemPhoto(photoId)
      setCharter((c) => ({
        ...c,
        problems: c.problems.map((p) =>
          p.id === problemId ? { ...p, photos: p.photos.filter((ph) => ph.id !== photoId) } : p
        )
      }))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAddCustomer(e) {
    e.preventDefault()
    if (!newCustomer.fullName.trim()) return
    try {
      const customer = await addCustomer(id, newCustomer)
      setCharter((c) => ({ ...c, customers: [...c.customers, customer] }))
      setNewCustomer({ fullName: '', phone: '', notes: '' })
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteCustomer(customerId) {
    if (!window.confirm('Διαγραφή αυτού του πελάτη;')) return
    try {
      await deleteCustomer(customerId)
      setCharter((c) => ({ ...c, customers: c.customers.filter((cu) => cu.id !== customerId) }))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleExperiencePhoto(file) {
    if (!file) return
    setUploadingExperience(true)
    try {
      const path = await uploadCharterPhoto(user.id, id, file)
      const photo = await addExperiencePhoto(id, path, '')
      setCharter((c) => ({ ...c, experiencePhotos: [photo, ...c.experiencePhotos] }))
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingExperience(false)
    }
  }

  async function handleDeleteExperiencePhoto(photoId) {
    try {
      await deleteExperiencePhoto(photoId)
      setCharter((c) => ({ ...c, experiencePhotos: c.experiencePhotos.filter((p) => p.id !== photoId) }))
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return <div className="px-4 pt-6 pb-24 text-sm text-gray-400">Φόρτωση…</div>
  }

  if (!charter) {
    return (
      <div className="pb-24">
        <Header title="Charter" backTo="/charters" />
        <p className="px-4 text-sm text-red-600">{error || 'Δεν βρέθηκε.'}</p>
      </div>
    )
  }

  const missingAtCheckIn = checkIn?.items.filter((i) => i.status === 'missing') ?? []

  return (
    <div className="pb-24">
      <Header
        title="Φάκελος Charter"
        backTo="/charters"
        action={
          <Link to={`/charters/${id}/edit`} className="text-sm text-accent-600 font-medium">
            Επεξεργασία
          </Link>
        }
      />

      <div className="px-4 space-y-5">
        <section className="rounded-xl bg-white shadow-soft border border-gray-100 p-4">
          <p className="text-sm font-medium">
            {new Date(charter.start_date).toLocaleDateString('el-GR')} – {new Date(charter.end_date).toLocaleDateString('el-GR')}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {[charter.vessel_name, charter.company_name].filter(Boolean).join(' · ') || '—'}
          </p>
          {charter.fee != null && <p className="text-sm text-accent-600 font-medium mt-1">{charter.fee}€</p>}
          {charter.notes && <p className="text-sm text-gray-500 mt-2 whitespace-pre-wrap">{charter.notes}</p>}
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Vessel check-in */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Παραλαβή σκάφους</h2>
          <div className="rounded-xl bg-white shadow-soft border border-gray-100 p-4">
            {checkIn ? (
              <>
                <p className="text-xs text-gray-400 mb-2">
                  Έλεγχος {new Date(checkIn.closed_at ?? checkIn.started_at).toLocaleDateString('el-GR')}
                </p>
                {missingAtCheckIn.length === 0 ? (
                  <p className="text-sm text-gray-500">Όλα εντάξει κατά την παραλαβή.</p>
                ) : (
                  <ul className="space-y-0.5 mb-2">
                    {missingAtCheckIn.map((i) => (
                      <li key={i.id} className="text-sm text-red-600">
                        ⚠ {i.item_name}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400 mb-3">Δεν έχει γίνει ακόμα έλεγχος παραλαβής για αυτό το charter.</p>
            )}
            <button
              onClick={() => navigate('/inventory/check', { state: { charterId: id, vesselName: charter.vessel_name } })}
              className="w-full rounded-lg bg-accent-50 text-accent-700 py-2.5 text-sm font-medium"
            >
              {checkIn ? 'Νέος έλεγχος παραλαβής' : 'Έλεγχος παραλαβής σκάφους'}
            </button>
          </div>
        </section>

        {/* Problems */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Προβλήματα σκάφους</h2>
          <div className="space-y-3">
            {charter.problems.map((p) => (
              <div key={p.id} className="rounded-xl bg-white shadow-soft border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm flex-1 whitespace-pre-wrap">{p.description}</p>
                  <button onClick={() => handleDeleteProblem(p.id)} className="text-xs text-red-500 shrink-0">
                    Διαγραφή
                  </button>
                </div>
                <div className="flex gap-2 mt-3 overflow-x-auto">
                  {p.photos.map((photo) => (
                    <PhotoThumb key={photo.id} path={photo.storage_path} onDelete={() => handleDeleteProblemPhoto(p.id, photo.id)} />
                  ))}
                  <button
                    onClick={() => problemPhotoInputs.current[p.id]?.click()}
                    disabled={uploadingProblemId === p.id}
                    className="w-24 h-24 rounded-lg border border-dashed border-gray-300 text-gray-400 text-xs shrink-0"
                  >
                    {uploadingProblemId === p.id ? '…' : '+ Φωτό'}
                  </button>
                  <input
                    ref={(el) => (problemPhotoInputs.current[p.id] = el)}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleProblemPhoto(p.id, e.target.files?.[0])}
                  />
                </div>
              </div>
            ))}

            <form onSubmit={handleAddProblem} className="rounded-xl bg-white shadow-soft border border-gray-100 p-3 space-y-2">
              <textarea
                value={newProblem}
                onChange={(e) => setNewProblem(e.target.value)}
                rows={2}
                placeholder="Περιγραφή προβλήματος…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
              <button type="submit" className="w-full rounded-lg bg-accent-500 text-white py-2 text-sm font-medium">
                Προσθήκη προβλήματος
              </button>
            </form>
          </div>
        </section>

        {/* Customer log */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Πελάτες</h2>
          <div className="rounded-xl bg-white shadow-soft border border-gray-100 divide-y divide-gray-100 overflow-hidden mb-3">
            {charter.customers.map((cu) => (
              <div key={cu.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{cu.full_name}</span>
                  <div className="flex items-center gap-3">
                    {cu.phone && (
                      <a href={`tel:${cu.phone}`} className="text-accent-600 text-sm">
                        ☎ {cu.phone}
                      </a>
                    )}
                    <button onClick={() => handleDeleteCustomer(cu.id)} className="text-xs text-red-500">
                      Διαγραφή
                    </button>
                  </div>
                </div>
                {cu.notes && <p className="text-sm text-gray-500 mt-1">{cu.notes}</p>}
              </div>
            ))}
            {charter.customers.length === 0 && <p className="px-4 py-4 text-sm text-gray-400">Δεν έχουν καταχωρηθεί πελάτες.</p>}
          </div>

          <form onSubmit={handleAddCustomer} className="rounded-xl bg-white shadow-soft border border-gray-100 p-3 space-y-2">
            <input
              type="text"
              value={newCustomer.fullName}
              onChange={(e) => setNewCustomer((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="Ονοματεπώνυμο"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <input
              type="tel"
              value={newCustomer.phone}
              onChange={(e) => setNewCustomer((f) => ({ ...f, phone: e.target.value }))}
              placeholder="Τηλέφωνο"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <textarea
              value={newCustomer.notes}
              onChange={(e) => setNewCustomer((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Σημείωση / εντύπωση…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <button type="submit" className="w-full rounded-lg bg-accent-500 text-white py-2 text-sm font-medium">
              Προσθήκη πελάτη
            </button>
          </form>
        </section>

        {/* Experience photos */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Φωτογραφίες εμπειρίας</h2>
          <div className="flex gap-2 overflow-x-auto">
            {charter.experiencePhotos.map((photo) => (
              <PhotoThumb key={photo.id} path={photo.storage_path} onDelete={() => handleDeleteExperiencePhoto(photo.id)} />
            ))}
            <button
              onClick={() => experiencePhotoInput.current?.click()}
              disabled={uploadingExperience}
              className="w-24 h-24 rounded-lg border border-dashed border-gray-300 text-gray-400 text-xs shrink-0"
            >
              {uploadingExperience ? '…' : '+ Φωτό'}
            </button>
            <input
              ref={experiencePhotoInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleExperiencePhoto(e.target.files?.[0])}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
