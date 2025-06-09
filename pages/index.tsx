// pages/index.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/router'
import { User } from '@supabase/supabase-js'
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { Editor, Button, Heading } from '../components'

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hideTitle, setHideTitle] = useState(false);

  useEffect(() => {
    const fetchSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
      } else {
        setUser(session.user)
      }
    }
    fetchSession()
  }, [router])

  useEffect(() => {
    const handleScroll = () => {
      setHideTitle(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <main className="flex flex-col h-screen">
      {/* Header: sidebarOpen이 true이거나, 스크롤이 상단일 때만 보임 */}
      {(sidebarOpen || !hideTitle) && (
        <header className="h-24 px-6 flex items-center bg-white transition-all duration-300">
          <button
            className="p-2"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6 text-gray-700" />
          </button>
          {/* 제목은 hideTitle이 false일 때만 보임 */}
          {!hideTitle && (
            <Heading level={1} className="ml-4 text-xl font-bold text-gray-900 transition-all duration-300">
              오늘은 무슨 일이 있었나요?
            </Heading>
          )}
        </header>
      )}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor 전체 UI는 Editor.tsx에서 담당 */}
        <Editor userId={user?.id || ''} />
      </div>
      {/* 왼쪽 슬라이드 사이드바 (모바일용) */}
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
        {/* Sidebar 내부 콘텐츠 */}
        <nav className="p-4 space-y-4">
          {user && (
            <Button
              onClick={() => {
                supabase.auth.signOut();
                router.push("/login");
              }}
            >
              로그아웃
            </Button>
          )}
        </nav>
      </aside>
    </main>
  )
}