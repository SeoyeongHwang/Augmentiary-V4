import { supabase } from './supabase'

export async function getParticipantCode(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('participant_code')
      .eq('id', userId)
      .single()
    
    if (error) {
      console.error('Error fetching participant_code:', error)
      return null
    }
    
    return data?.participant_code || null
  } catch (error) {
    console.error('Error in getParticipantCode:', error)
    return null
  }
}
