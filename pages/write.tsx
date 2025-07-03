import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { ArrowLeftIcon } from "@heroicons/react/24/outline"
import { TiptapEditor, Button, ESMModal } from '../components'
import ConfirmModal from '../components/ConfirmModal'
import type { ESMData } from '../components/ESMModal'
import type { CreateESMResponseData } from '../types/esm'
import type { CreateEntryData } from '../types/entry'
import { getCurrentKST } from '../lib/time'
import { getParticipantCode } from '../lib/auth'

export default function Write() {
  const [user, setUser] = useState<User | null>(null)
  const [participantCode, setParticipantCode] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [showESM, setShowESM] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
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
        // participant_code 가져오기
        const code = await getParticipantCode(session.user.id)
        setParticipantCode(code)
      }
    }
    fetchSession()
  }, [router])

  const handleSave = async () => {
    if (!user || !participantCode) {
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
    if (!participantCode) {
      alert('참가자 코드를 확인할 수 없습니다.')
      return
    }

    try {
      // 1. entry ID를 먼저 생성 (shared는 임시로 false로 설정)
      const entryDataToInsert: CreateEntryData = {
        participant_code: participantCode,
        title: title.trim(),
        content_html: content,
        shared: false // 임시로 false, ESM 응답 후 업데이트
      }
      
      const { data: entryData, error: entryError } = await supabase
        .from('entries')
        .insert(entryDataToInsert)
        .select()
        .single()

      if (entryError) {
        console.error('일기 저장 실패:', entryError)
        throw entryError
      }

      const entryId = entryData.id
      console.log('생성된 entry ID:', entryId)

      // 2. ESM 응답 저장 (entry_id 포함)
      const esmDataToInsert: CreateESMResponseData = {
        participant_code: participantCode,
        entry_id: entryId,
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
        throw esmError
      }

      // 3. ESM 응답에 따라 entry의 shared 필드 업데이트
      const { error: updateError } = await supabase
        .from('entries')
        .update({ shared: esmData.consent })
        .eq('id', entryId)

      if (updateError) {
        console.error('entry 업데이트 실패:', updateError)
        throw updateError
      }

      console.log('저장 완료 - entry_id:', entryId, 'shared:', esmData.consent)

      setShowESM(false)
      router.push('/')
    } catch (error) {
      console.error('저장 중 오류:', error)
      alert('저장 중 오류가 발생했습니다.')
    }
  }

  const handleBack = () => {
    setShowConfirmModal(true)
  }

  const handleConfirmBack = () => {
    setShowConfirmModal(false)
    router.push('/')
  }

  const handleCancelBack = () => {
    setShowConfirmModal(false)
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
        <TiptapEditor 
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

      {/* 확인 모달 */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onConfirm={handleConfirmBack}
        onCancel={handleCancelBack}
        title="저장되지 않은 정보"
        message="저장되지 않은 정보는 사라집니다. 뒤로가시겠습니까?"
        confirmText="뒤로가기"
        cancelText="취소"
      />
    </div>
  )
}
