import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'

export interface SessionUser {
  id: string
  email: string
  name: string
  participant_code: string
  created_at: string
  profile?: string
}

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 현재 세션 가져오기
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('세션 가져오기 실패:', error)
          setLoading(false)
          return
        }

        if (session?.user) {
          // 사용자 정보를 DB에서 가져오기
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single()

          if (userError) {
            console.error('사용자 정보 가져오기 실패:', userError)
            setLoading(false)
            return
          }

          setUser(userData)
        }
      } catch (error) {
        console.error('세션 처리 중 오류:', error)
      } finally {
        setLoading(false)
      }
    }

    getSession()

    // 인증 상태 변경 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          // 로그인 시 사용자 정보 가져오기
          const { data: userData, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single()

          if (!error && userData) {
            setUser(userData)
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('로그아웃 실패:', error)
      }
    } catch (error) {
      console.error('로그아웃 중 오류:', error)
    }
  }

  return {
    user,
    loading,
    signOut
  }
}
