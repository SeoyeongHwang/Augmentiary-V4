// pages/index.tsx
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline"
import { Button, Heading, JournalCard, JournalModal } from '../components'
import type { Entry } from '../types/entry'
import { formatKST } from '../lib/time'
import { getParticipantCode } from '../lib/auth'

import type { User as AppUser } from '../types/user'

export default function Home() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hideTitle, setHideTitle] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [showModal, setShowModal] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const fetchSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
      } else {
        setAuthUser(session.user)
        await fetchUserData(session.user.id)
        await fetchEntries(session.user.id)
      }
    }
    fetchSession()
  }, [router])

  const fetchUserData = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('사용자 정보 불러오기 실패:', error)
      } else {
        setUser(data)
      }
    } catch (error) {
      console.error('사용자 정보 불러오기 오류:', error)
    }
  }

  const fetchEntries = async (userId: string) => {
    try {
      // participant_code 가져오기
      const participantCode = await getParticipantCode(userId)
      if (!participantCode) {
        console.error('참가자 코드를 찾을 수 없습니다.')
        return
      }

      const { data, error } = await supabase
        .from('entries')
        .select('*')
        .eq('participant_code', participantCode)
        .order('created_at', { ascending: false })
        .limit(9) // 최대 9개 (3x3 그리드)

      if (error) {
        console.error('일기 목록 불러오기 실패:', error)
      } else {
        setEntries(data || [])
      }
    } catch (error) {
      console.error('일기 목록 불러오기 오류:', error)
    } finally {
      setLoading(false)
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
    await supabase.auth.signOut()
    router.push('/login')
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return '좋은 아침입니다'
    if (hour < 18) return '좋은 오후입니다'
    return '좋은 저녁입니다'
  }

  if (!authUser || !user) {
    return <div>로딩 중...</div>
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      {(sidebarOpen || !hideTitle) && (
        <header className="h-24 p-6 flex items-center bg-white transition-all duration-300 shadow-sm">
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
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900">
            <span className="font-bold">{user.name}님</span>, {getGreeting()}.
          </h1>
        </div>

        {/* 작성하러 가기 버튼 */}
        <div className="mb-8 text-center">
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
          
          {loading ? (
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