import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { ArrowLeftIcon } from "@heroicons/react/24/outline"
import { TiptapEditor, Button, ESMModal } from '../components'
import ConfirmModal from '../components/ConfirmModal'
import { LogStatus } from '../components/LogStatus'
import type { ESMData } from '../components/ESMModal'
import type { CreateESMResponseData } from '../types/esm'
import type { CreateEntryData } from '../types/entry'
import { getCurrentKST } from '../lib/time'
import { getParticipantCode } from '../lib/auth'
import { useInteractionLog } from '../hooks/useInteractionLog'
import { generateEntryId } from '../utils/entry'

export default function Write() {
  const [user, setUser] = useState<User | null>(null)
  const [participantCode, setParticipantCode] = useState<string | null>(null)
  const [entryId, setEntryId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [showESM, setShowESM] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const router = useRouter()
  
  // 인터랙션 로그 훅 사용
  const { 
    logStartWriting, 
    logEntrySave, 
    logESMSubmit,
    logTriggerESM,
    canLog 
  } = useInteractionLog()

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

  // entry_id를 메모리에서만 생성 (participantCode 준비 후)
  useEffect(() => {
    if (participantCode && !entryId) {
      setEntryId(generateEntryId(participantCode))
    }
  }, [participantCode, entryId])

  // 글쓰기 시작 로그 (entryId 준비 후 1회만)
  useEffect(() => {
    if (canLog && entryId) {
      logStartWriting(entryId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLog, entryId])

  const handleSave = async () => {
    console.log('=== ESM 모달 표시 프로세스 시작 ===')
    console.log('ESM 모달 표시 시도:', { 
      user: !!user, 
      participantCode, 
      entryId, 
      title: title.trim(), 
      contentLength: content.length,
      showESM: showESM
    })
    
    if (!user || !participantCode || !entryId) {
      console.error('ESM 모달 표시 실패: 사용자 정보 부족', { user: !!user, participantCode, entryId })
      alert('사용자 정보를 확인할 수 없습니다. 페이지를 새로고침해주세요.')
      return
    }

    if (!title.trim() || !content.trim()) {
      console.log('제목 또는 내용이 비어있음')
      alert('제목과 내용을 모두 입력해주세요.')
      return
    }

    // ESM 트리거 로그 (ESM 모달 표시)
    if (canLog) {
      console.log('ESM 트리거 로그 기록')
      logTriggerESM(entryId)
    }

    console.log('ESM 모달 표시')
    setShowESM(true)
  }

  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleESMSubmit = async (esmData: ESMData) => {
    console.log('=== ESM 제출 및 저장 프로세스 시작 ===')
    console.log('ESM 데이터:', esmData)
    console.log('현재 상태:', { participantCode, entryId, title, contentLength: content.length })
    console.log('이미 제출 중인지:', isSubmitting)
    
    // 중복 제출 방지
    if (isSubmitting) {
      console.log('이미 제출 중입니다. 중복 제출 방지')
      return
    }
    
    if (!participantCode || !entryId) {
      console.error('ESM 제출 실패: 참가자 정보 부족', { participantCode, entryId })
      alert('참가자 코드 또는 entry_id를 확인할 수 없습니다.')
      return
    }

    setIsSubmitting(true)
    console.log('제출 상태를 true로 설정')

    // 저장 로그 기록 (실제 저장 시점)
    if (canLog) {
      console.log('저장 로그 기록')
      logEntrySave(entryId)
    }

    let success = false
    
    try {
      console.log('데이터베이스에 저장 시도...')
      console.log('저장할 데이터:', {
        id: entryId,
        participant_code: participantCode,
        title: title.trim(),
        content_html: content.substring(0, 100) + '...', // 내용 일부만 로그
        shared: esmData.consent
      })
      
      // 1. entry 저장 (최초 저장)
      const { data: entryData, error: entryError } = await supabase
        .from('entries')
        .insert({
          id: entryId,
          participant_code: participantCode,
          title: title.trim(),
          content_html: content,
          shared: esmData.consent
        })
        .select()

      console.log('entry 저장 결과:', { data: entryData, error: entryError })

      if (entryError) {
        console.error('entry 저장 실패:', entryError)
        throw entryError
      }

      console.log('entry 저장 성공')

      // 2. ESM 응답 저장
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

      console.log('ESM 응답 저장 성공')

      // ESM 제출 로그
      if (canLog) {
        console.log('ESM 제출 로그 기록')
        logESMSubmit(entryId, esmData.consent)
      }

      console.log('모든 저장 완료!')
      success = true
    } catch (error) {
      console.error('저장 중 오류:', error)
      alert(`저장 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    } finally {
      // 제출 상태를 항상 false로 리셋
      setIsSubmitting(false)
      console.log('제출 상태를 false로 리셋')
      
      // 성공했을 때만 모달 닫고 홈으로 이동
      if (success) {
        setShowESM(false)
        router.push('/')
      }
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

  if (!user || !entryId) {
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
            disabled={!entryId}
          >
            저장
          </Button>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-hidden">
        <TiptapEditor 
          userId={user.id}
          entryId={entryId}
          onTitleChange={setTitle}
          onContentChange={setContent}
          onSave={handleSave}
        />
      </main>

      {/* ESM 모달 */}
      <ESMModal
        isOpen={showESM}
        onSubmit={handleESMSubmit}
        onClose={() => setShowESM(false)}
        isSubmitting={isSubmitting}
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

      {/* 로그 상태 표시 (개발용) */}
      <LogStatus />
    </div>
  )
}
