import { supabase } from './supabaseClient'

// Public marketplace reads go through the `public_deals` view (no edit_token
// column exposed there). Writes go through RPCs that check the caller's
// edit_token server-side, so no login system is needed for companies to
// manage the listing they just posted.

export async function listActiveDeals({ from, to, oneWayOnly, query } = {}) {
  let q = supabase.from('public_deals').select('*').order('trip_start', { ascending: true })
  if (from) q = q.gte('trip_start', from)
  if (to) q = q.lte('trip_start', to)
  if (oneWayOnly) q = q.eq('one_way', true)

  const { data, error } = await q
  if (error) throw error

  let rows = data || []
  if (query && query.trim()) {
    const needle = query.trim().toLowerCase()
    rows = rows.filter(d =>
      [d.departure_port, d.arrival_port, d.boat_name, d.boat_type, d.company_name]
        .filter(Boolean)
        .some(v => v.toLowerCase().includes(needle))
    )
  }
  return rows
}

export async function createDeal(payload) {
  const { data, error } = await supabase.rpc('create_deal', { payload })
  if (error) throw error
  return data?.[0] || null
}

export async function getDealForEdit(id, token) {
  const { data, error } = await supabase.rpc('get_deal_for_edit', { p_id: id, p_token: token })
  if (error) throw error
  return data?.[0] || null
}

export async function updateDeal(id, token, payload) {
  const { data, error } = await supabase.rpc('update_deal', { p_id: id, p_token: token, payload })
  if (error) throw error
  return data
}

export async function removeDeal(id, token) {
  const { data, error } = await supabase.rpc('delete_deal', { p_id: id, p_token: token })
  if (error) throw error
  return data
}

export async function uploadDealPhoto(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('deal-photos').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('deal-photos').getPublicUrl(path)
  return data.publicUrl
}
