import { useState, useEffect, useCallback, useRef } from 'react'
import { User } from '../types/user'

export function useSession() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // 세션 체크 함수를 useCallback으로 메모이제이션
  const checkSession = useCallback(async (shouldRefreshOnError = false) => {
    try {
      // localStorage에서 세션 정보 가져오기
      const sessionData = localStorage.getItem('supabase_session')
      
      if (!sessionData) {
        setUser(null)
        setLoading(false)
        return { success: false, needsLogin: true }
      }

      const session = JSON.parse(sessionData)
      
      if (!session.access_token) {
        localStorage.removeItem('supabase_session')
        setUser(null)
        setLoading(false)
        return { success: false, needsLogin: true }
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
        // 401 에러이고 refresh_token이 있으면 자동 갱신 시도
        if (response.status === 401 && session.refresh_token && shouldRefreshOnError) {
          console.log('🔄 토큰 만료 감지, 자동 갱신 시도')
          const refreshSuccess = await refreshSession()
          if (refreshSuccess) {
            console.log('✅ 토큰 자동 갱신 성공')
            return { success: true, needsLogin: false }
          }
        }
        
        localStorage.removeItem('supabase_session')
        setUser(null)
        setLoading(false)
        return { success: false, needsLogin: true }
      }

      setUser(data.data.user)
      setLoading(false)
      return { success: true, needsLogin: false }

    } catch (error) {
      console.error('세션 체크 중 오류:', error)
      localStorage.removeItem('supabase_session')
      setUser(null)
      setLoading(false)
      return { success: false, needsLogin: true }
    }
  }, [])

  // 초기 세션 체크 및 주기적 갱신 설정
  useEffect(() => {
    // 초기 세션 체크 (에러 시 자동 갱신 시도)
    checkSession(true)

    // 5분마다 세션 유효성 체크 및 필요시 갱신
    intervalRef.current = setInterval(async () => {
      const result = await checkSession(true)
      if (result.needsLogin) {
        console.log('⚠️ 주기적 세션 체크에서 로그인 필요 감지')
        // 사용자에게 알림 (선택사항)
        // alert('세션이 만료되었습니다. 다시 로그인해주세요.')
      }
    }, 5 * 60 * 1000) // 5분마다

    // cleanup function
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [checkSession])

  const signOut = async () => {
    try {
      // interval 정리
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      
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
      console.error('토큰 갱신 중 오류:', error)
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
    refreshUser,
    checkSession: () => checkSession(true) // 수동 세션 체크용
  }
}
