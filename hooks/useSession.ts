import { useEffect, useState } from 'react'
import type { User } from '../types/user'

type SessionUser = User

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 서버사이드 API로 세션 확인
    const checkSession = async () => {
      try {
        console.log('🔍 서버사이드 세션 확인 시작')
        
        // localStorage에서 세션 정보 가져오기
        const sessionData = localStorage.getItem('supabase_session')
        
        if (!sessionData) {
          console.log('❌ 로컬 세션 없음')
          setUser(null)
          setLoading(false)
          return
        }

        const session = JSON.parse(sessionData)
        
        if (!session.access_token) {
          console.log('❌ 액세스 토큰 없음')
          localStorage.removeItem('supabase_session')
          setUser(null)
          setLoading(false)
          return
        }

        // 서버사이드 API로 세션 검증
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        })

        const data = await response.json()

        if (!response.ok || !data.data?.isLoggedIn) {
          console.log('❌ 서버 세션 검증 실패:', data.error)
          localStorage.removeItem('supabase_session')
          setUser(null)
          setLoading(false)
          return
        }

        console.log('✅ 서버 세션 검증 성공:', data.data.user.participant_code)
        setUser(data.data.user)
        setLoading(false)

      } catch (error) {
        console.error('❌ 세션 확인 중 오류:', error)
        localStorage.removeItem('supabase_session')
        setUser(null)
        setLoading(false)
      }
    }

    checkSession()
  }, [])

  const signOut = async () => {
    try {
      console.log('🚪 로그아웃 시작')
      
      const sessionData = localStorage.getItem('supabase_session')
      let accessToken = null
      
      if (sessionData) {
        const session = JSON.parse(sessionData)
        accessToken = session.access_token
      }

      // 서버사이드 API로 로그아웃
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: accessToken }),
      })

      // 로컬 세션 정리
      localStorage.removeItem('supabase_session')
      setUser(null)
      
      console.log('✅ 로그아웃 완료')
    } catch (error) {
      console.error('❌ 로그아웃 중 오류:', error)
      // 에러가 있어도 로컬 세션 정리
      localStorage.removeItem('supabase_session')
      setUser(null)
    }
  }

  const refreshSession = async () => {
    console.log('🔄 세션 갱신 시도')
    try {
      const sessionData = localStorage.getItem('supabase_session')
      
      if (!sessionData) {
        console.log('❌ 갱신할 세션 없음')
        return false
      }

      const session = JSON.parse(sessionData)
      
      if (!session.refresh_token) {
        console.log('❌ 리프레시 토큰 없음')
        return false
      }

      // 서버사이드 API로 토큰 갱신
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          access_token: session.access_token,
          refresh_token: session.refresh_token 
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.data?.isLoggedIn) {
        console.log('❌ 토큰 갱신 실패:', data.error)
        localStorage.removeItem('supabase_session')
        setUser(null)
        return false
      }

      // 새로운 세션 정보 저장
      if (data.data.session) {
        localStorage.setItem('supabase_session', JSON.stringify(data.data.session))
        console.log('✅ 세션 갱신 성공')
      }

      setUser(data.data.user)
      return true
    } catch (error) {
      console.error('❌ 세션 갱신 중 오류:', error)
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
