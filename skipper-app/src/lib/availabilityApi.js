import { supabase } from './supabaseClient'

export async function fetchPeriods(userId) {
  const { data, error } = await supabase
    .from('availability_periods')
    .select('id, start_date, end_date, is_available, price_per_day, notes')
    .eq('user_id', userId)
    .order('start_date', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchPeriod(id) {
  const { data, error } = await supabase
    .from('availability_periods')
    .select('id, start_date, end_date, is_available, price_per_day, notes')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function savePeriod({ id, userId, startDate, endDate, isAvailable, pricePerDay, notes }) {
  const payload = {
    user_id: userId,
    start_date: startDate,
    end_date: endDate,
    is_available: isAvailable,
    price_per_day: pricePerDay === '' || pricePerDay === null || pricePerDay === undefined ? null : Number(pricePerDay),
    notes: notes?.trim() || null
  }
  if (id) {
    const { error } = await supabase.from('availability_periods').update(payload).eq('id', id)
    if (error) throw error
    return id
  }
  const { data, error } = await supabase.from('availability_periods').insert(payload).select('id').single()
  if (error) throw error
  return data.id
}

export async function deletePeriod(id) {
  const { error } = await supabase.from('availability_periods').delete().eq('id', id)
  if (error) throw error
}
