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
        
        // localStorage에서 세션 정보 가져오기
        const sessionData = localStorage.getItem('supabase_session')
        
        if (!sessionData) {
          setUser(null)
          setLoading(false)
          return
        }

        const session = JSON.parse(sessionData)
        
        if (!session.access_token) {
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
          localStorage.removeItem('supabase_session')
          setUser(null)
          setLoading(false)
          return
        }

        setUser(data.data.user)
        setLoading(false)

      } catch (error) {
        localStorage.removeItem('supabase_session')
        setUser(null)
        setLoading(false)
      }
    }

    checkSession()
  }, [])

  const signOut = async () => {
    try {
      
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
      
    } catch (error) {
      // 에러가 있어도 로컬 세션 정리
      localStorage.removeItem('supabase_session')
      setUser(null)
    }
  }

  const refreshSession = async () => {
    try {
      const sessionData = localStorage.getItem('supabase_session')
      
      if (!sessionData) {
        return false
      }

      const session = JSON.parse(sessionData)
      
      if (!session.refresh_token) {
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
        localStorage.removeItem('supabase_session')
        setUser(null)
        return false
      }

      // 새로운 세션 정보 저장
      if (data.data.session) {
        localStorage.setItem('supabase_session', JSON.stringify(data.data.session))
      }

      setUser(data.data.user)
      return true
    } catch (error) {
      return false
    }
  }

  const refreshUser = async () => {
    try {
      const sessionData = localStorage.getItem('supabase_session')
      
      if (!sessionData) {
        return false
      }

      const session = JSON.parse(sessionData)
      
      if (!session.access_token) {
        return false
      }

      // 서버사이드 API로 최신 사용자 정보 조회
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok || !data.data?.isLoggedIn) {
        return false
      }

      setUser(data.data.user)
      return true
    } catch (error) {
      return false
    }
  }

  return {
    user,
    loading,
    signOut,
    refreshSession,
    refreshUser
  }
}
