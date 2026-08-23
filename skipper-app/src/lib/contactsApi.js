import { supabase } from './supabaseClient'

// Nested select: pulls each contact together with its linked role/port tags
// in a single round trip, relying on the FKs declared in schema.sql.
const CONTACT_SELECT = `
  id, user_id, name, company, phone, email, notes, created_at, updated_at,
  contact_role_links ( contact_roles ( id, name ) ),
  contact_port_links ( contact_ports ( id, name ) )
`

function normalizeContact(row) {
  return {
    ...row,
    roles: (row.contact_role_links ?? []).map((l) => l.contact_roles).filter(Boolean),
    ports: (row.contact_port_links ?? []).map((l) => l.contact_ports).filter(Boolean)
  }
}

export async function fetchContacts() {
  const { data, error } = await supabase
    .from('contacts')
    .select(CONTACT_SELECT)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(normalizeContact)
}

export async function fetchContact(id) {
  const { data, error } = await supabase.from('contacts').select(CONTACT_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? normalizeContact(data) : null
}

export async function fetchTags(table) {
  const { data, error } = await supabase.from(table).select('id, name').order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Given a list of tag names, creates the ones that don't yet exist for this
// user and returns the full { id, name } rows (existing + newly created),
// relying on the (user_id, name) unique constraint from schema.sql.
export async function ensureTags(table, userId, names) {
  const cleanNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  if (cleanNames.length === 0) return []
  const rows = cleanNames.map((name) => ({ user_id: userId, name }))
  const { data, error } = await supabase.from(table).upsert(rows, { onConflict: 'user_id,name' }).select('id, name')
  if (error) throw error
  return data ?? []
}

export async function saveContact({ id, userId, name, company, phone, email, notes, roleNames, portNames }) {
  const payload = {
    user_id: userId,
    name: name.trim(),
    company: company?.trim() || null,
    phone: phone?.trim() || null,
    email: email?.trim() || null,
    notes: notes?.trim() || null
  }

  let contactId = id
  if (contactId) {
    const { error } = await supabase.from('contacts').update(payload).eq('id', contactId)
    if (error) throw error
  } else {
    const { data, error } = await supabase.from('contacts').insert(payload).select('id').single()
    if (error) throw error
    contactId = data.id
  }

  const [roles, ports] = await Promise.all([
    ensureTags('contact_roles', userId, roleNames),
    ensureTags('contact_ports', userId, portNames)
  ])

  await syncLinks('contact_role_links', 'role_id', contactId, roles.map((r) => r.id))
  await syncLinks('contact_port_links', 'port_id', contactId, ports.map((p) => p.id))

  return contactId
}

async function syncLinks(table, tagColumn, contactId, tagIds) {
  const { error: deleteError } = await supabase.from(table).delete().eq('contact_id', contactId)
  if (deleteError) throw deleteError
  if (tagIds.length === 0) return
  const rows = tagIds.map((tagId) => ({ contact_id: contactId, [tagColumn]: tagId }))
  const { error: insertError } = await supabase.from(table).insert(rows)
  if (insertError) throw insertError
}

export async function deleteContact(id) {
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) throw error
}
