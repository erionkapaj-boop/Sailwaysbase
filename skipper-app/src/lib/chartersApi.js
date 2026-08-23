import { supabase } from './supabaseClient'

const CHARTER_SELECT = 'id, user_id, start_date, end_date, vessel_name, company_contact_id, company_name, fee, availability_period_id, notes, created_at'

export async function fetchCharters(userId) {
  const { data, error } = await supabase
    .from('charters')
    .select(CHARTER_SELECT)
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchUpcomingCharter(userId) {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('charters')
    .select(CHARTER_SELECT)
    .eq('user_id', userId)
    .gte('end_date', today)
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchCharter(id) {
  const { data: charter, error } = await supabase.from('charters').select(CHARTER_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  if (!charter) return null

  const [{ data: problems, error: problemsError }, { data: customers, error: customersError }, { data: photos, error: photosError }] =
    await Promise.all([
      supabase
        .from('charter_problems')
        .select('id, description, created_at, charter_problem_photos ( id, storage_path, created_at )')
        .eq('charter_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('charter_customers').select('id, full_name, phone, notes, created_at').eq('charter_id', id).order('created_at'),
      supabase
        .from('charter_experience_photos')
        .select('id, storage_path, caption, created_at')
        .eq('charter_id', id)
        .order('created_at', { ascending: false })
    ])
  if (problemsError) throw problemsError
  if (customersError) throw customersError
  if (photosError) throw photosError

  return {
    ...charter,
    problems: (problems ?? []).map((p) => ({ ...p, photos: p.charter_problem_photos ?? [] })),
    customers: customers ?? [],
    experiencePhotos: photos ?? []
  }
}

export async function saveCharter({ id, userId, startDate, endDate, vesselName, companyContactId, companyName, fee, notes }) {
  const payload = {
    user_id: userId,
    start_date: startDate,
    end_date: endDate,
    vessel_name: vesselName?.trim() || null,
    company_contact_id: companyContactId || null,
    company_name: companyName?.trim() || null,
    fee: fee === '' || fee === null || fee === undefined ? null : Number(fee),
    notes: notes?.trim() || null
  }
  if (id) {
    const { error } = await supabase.from('charters').update(payload).eq('id', id)
    if (error) throw error
    return id
  }
  const { data, error } = await supabase.from('charters').insert(payload).select('id').single()
  if (error) throw error
  return data.id
}

export async function deleteCharter(id) {
  const { error } = await supabase.from('charters').delete().eq('id', id)
  if (error) throw error
}

// -- Vessel problems + photos ------------------------------------------------

export async function addProblem(charterId, description) {
  const { data, error } = await supabase
    .from('charter_problems')
    .insert({ charter_id: charterId, description: description.trim() })
    .select('id, description, created_at')
    .single()
  if (error) throw error
  return { ...data, photos: [] }
}

export async function deleteProblem(id) {
  const { error } = await supabase.from('charter_problems').delete().eq('id', id)
  if (error) throw error
}

export async function uploadCharterPhoto(userId, charterId, file) {
  const path = `${userId}/${charterId}/${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from('charter-photos').upload(path, file)
  if (error) throw error
  return path
}

export async function getCharterPhotoUrl(path) {
  const { data, error } = await supabase.storage.from('charter-photos').createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

export async function addProblemPhoto(problemId, storagePath) {
  const { data, error } = await supabase
    .from('charter_problem_photos')
    .insert({ problem_id: problemId, storage_path: storagePath })
    .select('id, storage_path, created_at')
    .single()
  if (error) throw error
  return data
}

export async function deleteProblemPhoto(id) {
  const { error } = await supabase.from('charter_problem_photos').delete().eq('id', id)
  if (error) throw error
}

// -- Customer log -------------------------------------------------------------

export async function addCustomer(charterId, { fullName, phone, notes }) {
  const { data, error } = await supabase
    .from('charter_customers')
    .insert({ charter_id: charterId, full_name: fullName.trim(), phone: phone?.trim() || null, notes: notes?.trim() || null })
    .select('id, full_name, phone, notes, created_at')
    .single()
  if (error) throw error
  return data
}

export async function deleteCustomer(id) {
  const { error } = await supabase.from('charter_customers').delete().eq('id', id)
  if (error) throw error
}

// -- Experience photos ---------------------------------------------------------

export async function addExperiencePhoto(charterId, storagePath, caption) {
  const { data, error } = await supabase
    .from('charter_experience_photos')
    .insert({ charter_id: charterId, storage_path: storagePath, caption: caption?.trim() || null })
    .select('id, storage_path, caption, created_at')
    .single()
  if (error) throw error
  return data
}

export async function deleteExperiencePhoto(id) {
  const { error } = await supabase.from('charter_experience_photos').delete().eq('id', id)
  if (error) throw error
}
