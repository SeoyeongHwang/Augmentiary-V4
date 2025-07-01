import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { ArrowLeftIcon } from "@heroicons/react/24/outline"
import { QuillEditor, Button, ESMModal } from '../components'
import type { ESMData } from '../components/ESMModal'
import type { CreateESMResponseData } from '../types/esm'
import type { CreateEntryData } from '../types/entry'
import { getCurrentKST } from '../lib/time'

export default function Write() {
  const [user, setUser] = useState<User | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [showESM, setShowESM] = useState(false)
  const router = useRouter()

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

  const handleSave = async () => {
    if (!user) {
      alert('사용자 정보를 확인할 수 없습니다.')
      return
    }

    if (!title.trim() || !content.trim()) {
      alert('제목과 내용을 모두 입력해주세요.')
      return
    }

    // ESM 모달 표시
    setShowESM(true)
  }

  const handleESMSubmit = async (esmData: ESMData) => {
    try {
      // ESM 응답은 항상 저장
      const esmDataToInsert: CreateESMResponseData = {
        user_id: user?.id!,
        consent: esmData.consent,
        q1: esmData.q1,
        q2: esmData.q2,
        q3: esmData.q3,
        q4: esmData.q4,
        q5: esmData.q5
      }
      
      const { error: esmError } = await supabase
        .from('esm_responses')
        .insert(esmDataToInsert)

      if (esmError) {
        console.error('ESM 저장 실패:', esmError)
      }

      // 일기는 사용자가 동의한 경우에만 저장
      if (esmData.consent) {
        const entryDataToInsert: CreateEntryData = {
          user_id: user?.id!,
          title: title.trim(),
          content_html: content,
          shared: true
        }
        
        const { error: entryError } = await supabase
          .from('entries')
          .insert(entryDataToInsert)

        if (entryError) {
          console.error('일기 저장 실패:', entryError)
        }
      }

      setShowESM(false)
      router.push('/')
    } catch (error) {
      console.error('저장 중 오류:', error)
      alert('저장 중 오류가 발생했습니다.')
    }
  }

  const handleBack = () => {
    // QuillEditor에서 자체적으로 내용 변경 감지 및 확인 처리
    router.push('/')
  }

  if (!user) {
    return <div>로딩 중...</div>
  }

  return (
    <div className="flex flex-col h-screen">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center text-gray-600 hover:text-gray-900"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            뒤로가기
          </button>
          <h1 className="text-lg font-semibold text-gray-900"> </h1>
          <Button
            onClick={handleSave}
            className="px-6 py-2"
          >
            저장
          </Button>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-hidden">
        <QuillEditor 
          userId={user.id}
          onTitleChange={setTitle}
          onContentChange={setContent}
        />
      </main>

      {/* ESM 모달 */}
      <ESMModal
        isOpen={showESM}
        onSubmit={handleESMSubmit}
        onClose={() => setShowESM(false)}
      />
    </div>
  )
}
