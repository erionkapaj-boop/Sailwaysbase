import { supabase } from './supabaseClient'

const DEFAULT_ITEMS = [
  'Σωσίβια',
  'Πυροσβεστήρας',
  'Φαρμακείο',
  'Βεγγαλικά / φωτοβολίδες',
  'Βάρκα / Dinghy',
  'Εξωλέμβιος κινητήρας',
  'Άγκυρα & καδένα',
  'Σκοινιά πρόσδεσης',
  'Μπαλόνια (Fenders)',
  'Φώτα ναυσιπλοΐας',
  'VHF',
  'Έγγραφα σκάφους',
  'Εργαλειοθήκη',
  'Αντλία σεντίνας'
]

export async function fetchItems(userId) {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, name, category, sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function seedDefaultItemsIfEmpty(userId) {
  const existing = await fetchItems(userId)
  if (existing.length > 0) return existing
  const rows = DEFAULT_ITEMS.map((name, i) => ({ user_id: userId, name, sort_order: i }))
  const { data, error } = await supabase.from('inventory_items').insert(rows).select('id, name, category, sort_order')
  if (error) throw error
  return data ?? []
}

export async function createItem(userId, name, sortOrder) {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({ user_id: userId, name: name.trim(), sort_order: sortOrder })
    .select('id, name, category, sort_order')
    .single()
  if (error) throw error
  return data
}

export async function updateItem(id, fields) {
  const { error } = await supabase.from('inventory_items').update(fields).eq('id', id)
  if (error) throw error
}

export async function deleteItem(id) {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id)
  if (error) throw error
}

export async function saveCheck({ userId, vesselName, results }) {
  const { data: check, error: checkError } = await supabase
    .from('inventory_checks')
    .insert({
      user_id: userId,
      vessel_name: vesselName?.trim() || null,
      started_at: new Date().toISOString(),
      closed_at: new Date().toISOString()
    })
    .select('id, started_at, closed_at, vessel_name')
    .single()
  if (checkError) throw checkError

  const rows = results.map((r) => ({
    check_id: check.id,
    item_id: r.itemId,
    item_name: r.itemName,
    status: r.status
  }))
  if (rows.length > 0) {
    const { error: itemsError } = await supabase.from('inventory_check_items').insert(rows)
    if (itemsError) throw itemsError
  }
  return check
}

export async function fetchLatestCheck(userId) {
  const { data: check, error } = await supabase
    .from('inventory_checks')
    .select('id, vessel_name, started_at, closed_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!check) return null

  const { data: items, error: itemsError } = await supabase
    .from('inventory_check_items')
    .select('id, item_name, status')
    .eq('check_id', check.id)
  if (itemsError) throw itemsError

  return { ...check, items: items ?? [] }
}
