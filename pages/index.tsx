// pages/index.tsx
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '../utils/supabase/client'
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline"
import { Button, Heading, JournalCard, JournalModal } from '../components'
import type { Entry } from '../types/entry'

import { useSession } from '../hooks/useSession'

export default function Home() {
  const { user, loading: sessionLoading, signOut } = useSession()
  const [entries, setEntries] = useState<Entry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hideTitle, setHideTitle] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [showModal, setShowModal] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // 프로필이 비어있는지 확인하는 헬퍼 함수
  const isProfileEmpty = (profile: any): boolean => {
    if (!profile) return true
    
    // 문자열인 경우
    if (typeof profile === 'string') {
      return profile.trim() === ''
    }
    
    // 객체인 경우
    if (typeof profile === 'object') {
      // null이나 빈 객체인지 확인
      return profile === null || Object.keys(profile).length === 0
    }
    
    return true
  }

  // 사용자가 로그인되어 있으면 일기 목록 가져오기
  useEffect(() => {
    if (!sessionLoading && user) {
      // profile 데이터 디버깅
      console.log('🔍 user.profile 디버깅:', {
        profile: user.profile,
        type: typeof user.profile,
        isString: typeof user.profile === 'string',
        isObject: typeof user.profile === 'object',
        isNull: user.profile === null,
        isUndefined: user.profile === undefined
      })
      
      // profile이 비어있으면 설문 페이지로 이동
      const hasProfile = user.profile && 
        ((typeof user.profile === 'string' && user.profile.trim() !== '') ||
         (typeof user.profile === 'object' && user.profile !== null))
      
      if (!hasProfile) {
        console.log('📝 프로필이 비어있음 - 설문 페이지로 이동')
        router.push('/survey')
        return
      }
      
      fetchEntries()
    } else if (!sessionLoading && !user) {
      router.push('/login')
    }
  }, [user, sessionLoading, router])

  const fetchEntries = async () => {
    try {
      setEntriesLoading(true)
      
      // localStorage에서 세션 정보 가져오기
      const sessionData = localStorage.getItem('supabase_session')
      if (!sessionData) {
        console.error('세션 정보가 없습니다.')
        return
      }

      const session = JSON.parse(sessionData)
      if (!session.access_token) {
        console.error('액세스 토큰이 없습니다.')
        return
      }

      // 서버사이드 API로 일기 목록 조회
      const response = await fetch('/api/entries/list?limit=9', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('일기 목록 조회 실패:', data.error)
        if (response.status === 401) {
          // 세션 만료된 경우 로그인 페이지로 이동
          localStorage.removeItem('supabase_session')
          router.push('/login')
        }
        return
      }

      console.log('✅ 일기 목록 조회 성공:', data.data.entries.length + '개')
      setEntries(data.data.entries || [])
    } catch (error) {
      console.error('일기 목록 불러오기 오류:', error)
    } finally {
      setEntriesLoading(false)
    }
  }

  useEffect(() => {
    const handleScroll = () => {
      setHideTitle(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleCardClick = (entry: Entry) => {
    setSelectedEntry(entry)
    setShowModal(true)
  }

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return '좋은 아침입니다'
    if (hour < 18) return '좋은 오후입니다'
    return '좋은 저녁입니다'
  }

  // 세션 로딩 중이면 로딩 화면 표시
  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-lg text-gray-600">로딩 중...</div>
          <div className="text-sm text-gray-400 mt-2">세션 확인 중</div>
        </div>
      </div>
    )
  }

  // 로그인되지 않은 경우 (useEffect에서 리다이렉트 처리)
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-lg text-gray-600">로그인 페이지로 이동 중...</div>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#faf9f5]">
      {/* Header */}
      {(sidebarOpen || !hideTitle) && (
        <header className="h-24 p-6 flex items-center bg-[#faf9f5] transition-all duration-300 shadow-sm">
          <button
            className="p-2"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6 text-gray-700" />
          </button>
          {!hideTitle && (
            <Heading level={1} className="ml-4 text-xl font-bold text-gray-900 transition-all duration-300">
              Augmentiary
            </Heading>
          )}
        </header>
      )}

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-6">
        {/* 인사말 */}
        <div className="mt-16 mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900">
            <span className="font-bold">{user.name}님</span>, {getGreeting()}.
          </h1>
        </div>

        {/* 작성하러 가기 버튼 */}
        <div className="mb-16 text-center">
          <Button
            onClick={() => router.push('/write')}
            className="px-8 py-4 text-lg font-semibold"
          >
            작성하러 가기
          </Button>
        </div>

        {/* 이전 일기 카드 그리드 */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 text-center">이전 일기</h2>
          
          {entriesLoading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">불러오는 중...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">아직 작성된 일기가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {entries.map((entry) => (
                <JournalCard
                  key={entry.id}
                  id={entry.id}
                  title={entry.title}
                  content={entry.content_html}
                  createdAt={entry.created_at}
                  onClick={() => handleCardClick(entry)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <span className="text-lg font-bold">메뉴</span>
          <button
            className="p-2"
            onClick={() => setSidebarOpen(false)}
          >
            <XMarkIcon className="h-6 w-6 text-black" />
          </button>
        </div>
        <nav className="p-4 space-y-4">
          <Button
            onClick={handleLogout}
            className="w-full"
          >
            로그아웃
          </Button>
        </nav>
      </aside>

      {/* 일기 모달 */}
      {selectedEntry && (
        <JournalModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false)
            setSelectedEntry(null)
          }}
          title={selectedEntry.title}
          content={selectedEntry.content_html}
          createdAt={selectedEntry.created_at}
        />
      )}
    </main>
  )
}