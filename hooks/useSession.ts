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
  const [sessionRetryCount, setSessionRetryCount] = useState(0)

  useEffect(() => {
    // 현재 세션 가져오기 (재시도 로직 포함)
    const getSession = async (retryCount = 0) => {
      try {
        console.log(`🔍 세션 확인 시도 ${retryCount + 1}/3...`)
        
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('세션 가져오기 실패:', error)
          if (retryCount < 2) {
            console.log(`🔄 세션 재시도 중... (${retryCount + 1}/3)`)
            setTimeout(() => getSession(retryCount + 1), 1000)
            return
          }
          setLoading(false)
          return
        }

        if (session?.user) {
          console.log('✅ Supabase 세션 확인됨:', {
            userId: session.user.id,
            email: session.user.email,
            expiresAt: session.expires_at
          })
          
          // 사용자 정보를 DB에서 가져오기
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single()

          if (userError) {
            console.error('사용자 정보 가져오기 실패:', userError)
            if (retryCount < 2) {
              console.log(`🔄 사용자 정보 재시도 중... (${retryCount + 1}/3)`)
              setTimeout(() => getSession(retryCount + 1), 1000)
              return
            }
            setLoading(false)
            return
          }

          if (userData) {
            console.log('✅ 사용자 정보 로드 완료:', { 
              id: userData.id, 
              participant_code: userData.participant_code,
              hasProfile: !!userData.profile 
            })
            setUser(userData)
            setSessionRetryCount(0) // 성공 시 재시도 카운트 리셋
          } else {
            console.error('사용자 데이터가 없습니다.')
          }
        } else {
          console.warn('⚠️ 세션이 없습니다.')
        }
      } catch (error) {
        console.error('세션 처리 중 오류:', error)
        if (retryCount < 2) {
          console.log(`🔄 세션 처리 재시도 중... (${retryCount + 1}/3)`)
          setTimeout(() => getSession(retryCount + 1), 1000)
          return
        }
      } finally {
        if (retryCount >= 2) {
          setLoading(false)
        }
      }
    }

    getSession()

    // 인증 상태 변경 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: string, session: any) => {
        console.log('🔄 인증 상태 변경 감지:', event)
        
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('✅ 로그인 감지됨')
          // 이미 사용자 정보가 있으면 중복 로드 방지
          if (user && user.id === session.user.id) {
            console.log('⏭️ 이미 로드된 사용자 정보, 건너뜀')
            return
          }
          
          // 로그인 시 사용자 정보 가져오기
          const { data: userData, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single()

          if (!error && userData) {
            console.log('✅ 로그인 후 사용자 정보 로드 완료')
            setUser(userData)
          }
        } else if (event === 'SIGNED_OUT') {
          console.log('🚪 로그아웃 감지됨')
          setUser(null)
        } else if (event === 'TOKEN_REFRESHED') {
          console.log('🔄 토큰 갱신 감지됨')
          // 토큰 갱신 시 세션 재확인 (무한 루프 방지)
          if (!user) {
            getSession()
          }
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

  const refreshSession = async () => {
    console.log('🔄 세션 수동 갱신 시도...')
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession()
      if (error) {
        console.error('세션 갱신 실패:', error)
        return false
      }
      if (session) {
        console.log('✅ 세션 갱신 성공')
        // 갱신된 세션으로 사용자 정보 다시 로드
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()
        
        if (!userError && userData) {
          setUser(userData)
          return true
        }
      }
      return false
    } catch (error) {
      console.error('세션 갱신 중 오류:', error)
      return false
    }
  }

  return {
    user,
    loading,
    signOut,
    refreshSession
  }
}
