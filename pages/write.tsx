import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '../utils/supabase/client'
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
import { useSession } from '../hooks/useSession'
import { generateEntryId } from '../utils/entry'
import { getQueuedLogsForServerSide } from '../lib/logger'
import { getQueuedAIPromptsForServerSide } from '../utils/aiPromptQueue'

export default function Write() {
  const { user, refreshSession } = useSession()
  const supabase = createClient()
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
    const fetchParticipantCode = async () => {
      if (!user) {
        router.push('/login')
        return
      }
      
      try {
        // participant_code 가져오기
        const code = await getParticipantCode(user.id)
        if (code) {
          setParticipantCode(code)
        } else {
          console.error('❌ participant_code를 가져올 수 없습니다.')
          alert('참가자 정보를 확인할 수 없습니다. 다시 로그인해주세요.')
          router.push('/login')
        }
      } catch (error) {
        console.error('participant_code 가져오기 실패:', error)
        alert('참가자 정보를 가져오는 중 오류가 발생했습니다.')
        router.push('/login')
      }
    }
    
    if (user) {
      fetchParticipantCode()
    }
  }, [user, router])

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
    if (!user || !participantCode || !entryId) {
      console.error('ESM 모달 표시 실패: 사용자 정보 부족', { user: !!user, participantCode, entryId })
      alert('사용자 정보를 확인할 수 없습니다. 페이지를 새로고침해주세요.')
      return
    }

    if (!title.trim() || !content.trim()) {
      alert('제목과 내용을 모두 입력해주세요.')
      return
    }

    // ESM 트리거 로그 (ESM 모달 표시)
    if (canLog) {
      logTriggerESM(entryId)
    }

    setShowESM(true)
  }

  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleESMSubmit = async (esmData: ESMData) => {
    // 중복 제출 방지
    if (isSubmitting) {
      return
    }
    
    if (!participantCode || !entryId) {
      console.error('ESM 제출 실패: 참가자 정보 부족')
      alert('참가자 코드 또는 entry_id를 확인할 수 없습니다.')
      return
    }

    setIsSubmitting(true)

    // 저장 로그 기록 (실제 저장 시점)
    if (canLog) {
      try {
        logEntrySave(entryId)
      } catch (error) {
        console.error('저장 로그 기록 실패')
      }
    }

    // 데이터베이스 저장 시도
    try {
      if (!supabase) {
        throw new Error('Supabase 클라이언트가 초기화되지 않았습니다')
      }
      
      if (!user) {
        console.error('❌ 사용자 정보 없음')
        router.push('/login')
        return
      }
      
      // 필수 필드 검증
      if (!entryId || !participantCode || !title.trim() || !content.trim()) {
        throw new Error('필수 필드가 누락되었습니다')
      }
      
      // 데이터 형식 검증
      const insertData = {
        id: entryId,
        participant_code: participantCode,
        title: title.trim(),
        content_html: content,
        shared: esmData.consent
      }
      
      // 데이터 크기 검증
      if (content.length > 100000) {
        throw new Error(`콘텐츠가 너무 큽니다: ${content.length}자`)
      }
      
      // HTML 태그 정리
      const hasHtmlTags = /<[^>]*>/g.test(content)
      if (hasHtmlTags) {
        const cleanedContent = content
          .replace(/\s+/g, ' ') // 연속된 공백을 하나로
          .replace(/>\s+</g, '><') // 태그 사이 공백 제거
          .trim()
        
        insertData.content_html = cleanedContent
      }
      
      // ESM 데이터 준비
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
      
      // 큐에 있는 로그와 AI 프롬프트 데이터 가져오기
      const logsData = getQueuedLogsForServerSide()
      const aiPromptsData = getQueuedAIPromptsForServerSide()
      
      // AI 프롬프트 데이터를 서버에서 처리할 수 있도록 변환
      const processedAIPromptsData = aiPromptsData.map(prompt => ({
        ...prompt,
        ai_suggestion: JSON.stringify(prompt.ai_suggestion)
      }))
      
      // 서버 사이드 API 호출
      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entryData: insertData,
          esmData: esmDataToInsert,
          logsData: logsData,
          aiPromptsData: processedAIPromptsData
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ 서버 사이드 저장 실패:', errorData)
        throw new Error(errorData.error || '서버 사이드 저장 실패')
      }
      
      const result = await response.json()

      // ESM 저장 후 잠시 대기 (외래키 제약조건 검증 안정화)
      await new Promise(resolve => setTimeout(resolve, 500))

      // ESM 제출 로그
      if (canLog) {
        try {
          logESMSubmit(entryId, esmData.consent)
        } catch (error) {
          console.error('ESM 제출 로그 기록 실패:', error)
        }
      }

      // 성공 시 처리
      setIsSubmitting(false)
      setShowESM(false)
      
      // 페이지 이동 전 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // 메인 페이지로 이동
      await router.push('/')
      
    } catch (error) {
      console.error('저장 중 오류')
      console.error('❌ 저장 중 오류 상세:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      })
      
      // 실패 시 처리
      setIsSubmitting(false)
      
      // 에러 메시지 표시
      alert(`저장 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
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
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-lg text-gray-600">로딩 중...</div>
          <div className="text-sm text-gray-400 mt-2">
            {!user ? '사용자 정보 확인 중' : '글쓰기 준비 중'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-transparent px-6 py-4 flex-shrink-0">
        <div className="bg-transparent flex items-center justify-between">
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
          userId={user?.id || ''}
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
        title="메인 화면으로 나가기"
        message="저장되지 않은 정보는 사라집니다. 나가시겠습니까?"
        confirmText="나가기"
        cancelText="취소"
      />

      {/* 로그 상태 표시 (개발용) */}
      <LogStatus />
    </div>
  )
}
