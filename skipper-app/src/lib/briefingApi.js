import { supabase } from './supabaseClient'

export async function fetchBriefing(userId, language) {
  const { data, error } = await supabase
    .from('briefings')
    .select('id, language, title, content, updated_at')
    .eq('user_id', userId)
    .eq('language', language)
    .eq('is_default', true)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function saveBriefing({ id, userId, language, title, content }) {
  const payload = {
    user_id: userId,
    language,
    title: title?.trim() || null,
    content: content ?? '',
    is_default: true
  }
  if (id) {
    const { error } = await supabase.from('briefings').update(payload).eq('id', id)
    if (error) throw error
    return id
  }
  const { data, error } = await supabase.from('briefings').insert(payload).select('id').single()
  if (error) throw error
  return data.id
}
