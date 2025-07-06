import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
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
import { flushLogsAfterEntrySave } from '../lib/logger'
import { flushAIPromptsAfterEntrySave } from '../utils/aiPromptQueue'

export default function Write() {
  const { user, refreshSession } = useSession()
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
      
      // 인증 세션 상태 확인
      console.log('페이지 진입 시 인증 상태 확인')
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.error('인증 세션 확인 실패')
        alert('인증 상태를 확인할 수 없습니다. 다시 로그인해주세요.')
        router.push('/login')
        return
      }
      
      if (!session) {
        console.warn('인증 세션 없음')
        router.push('/login')
        return
      }
      
      console.log('인증 세션 확인됨')
      
      try {
        // participant_code 가져오기
        const code = await getParticipantCode(user.id)
        if (code) {
          setParticipantCode(code)
          console.log('✅ participant_code 설정 완료:', code)
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

    // 데이터베이스 저장 시도 (타임아웃 설정)
    try {
      console.log('Entry 저장 시작')
      
      // Supabase 연결 상태 확인
      console.log('Supabase 연결 상태 확인')
      
      if (!supabase) {
        throw new Error('Supabase 클라이언트가 초기화되지 않았습니다')
      }
      console.log('Supabase 클라이언트 확인됨')
      
      // 인증 상태 간단 확인 (무한 루프 방지)
      console.log('인증 상태 간단 확인')
      
      if (!user) {
        console.error('사용자 정보 없음')
        router.push('/login')
        return
      }
      
      console.log('사용자 정보 확인됨')
      
      // 1. entry 저장 (최초 저장) - 타임아웃 설정
      console.log('Entry 저장 시도')
      
      // 데이터 검증
      console.log('데이터 검증 시작')
      
      // 1. 필수 필드 검증
      if (!entryId || !participantCode || !title.trim() || !content.trim()) {
        throw new Error('필수 필드가 누락되었습니다')
      }
      
      // 2. 데이터 형식 검증
      const insertData = {
        id: entryId,
        participant_code: participantCode,
        title: title.trim(),
        content_html: content,
        shared: esmData.consent
      }
      
      console.log('📊 저장 데이터 상세:', {
        entryId,
        participantCode,
        titleLength: title.trim().length,
        contentLength: content.length,
        shared: esmData.consent,
        timestamp: new Date().toISOString()
      })
      
      // 3. 데이터 크기 검증
      if (content.length > 50000) {
        throw new Error(`콘텐츠가 너무 큽니다: ${content.length}자`)
      }
      
      // 4. HTML 태그 검증 (필요한 경우만)
      const hasHtmlTags = /<[^>]*>/g.test(content)
      if (hasHtmlTags) {
        console.log('📝 HTML 태그가 포함되어 있습니다')
      }
      
      console.log('✅ 데이터 검증 완료');
      
      console.log('🔄 Entry 저장 쿼리 실행 중...');
      
      try {
        console.log('🔄 실제 데이터 저장 시도...')
        console.log('📤 전송할 데이터:', JSON.stringify(insertData, null, 2))
        
        const entryPromise = supabase
          .from('entries')
          .insert(insertData)
        
        const entryResult = await Promise.race([
          entryPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Entry 저장 타임아웃')), 15000)
          )
        ])
        
        const { error: entryError } = entryResult as any
        
        if (entryError) {
          console.error('❌ entry 저장 실패:', entryError)
          console.error('❌ entry 저장 실패 상세:', {
            code: entryError.code,
            message: entryError.message,
            details: entryError.details,
            hint: entryError.hint
          })
          throw entryError
        }

        console.log('🎉 Entry 저장 성공!');
        
      } catch (error) {
        console.error('❌ Entry 저장 중 예외 발생:', error)
        throw error
      }

      // Entry 저장 후 잠시 대기 (DB 트랜잭션 안정화)
      await new Promise(resolve => setTimeout(resolve, 500))

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
      
      console.log('🔄 ESM 응답 저장 시작:', esmDataToInsert)
      
      const { error: esmError } = await supabase
        .from('esm_responses')
        .insert(esmDataToInsert)
        
      if (esmError) {
        console.error('ESM 저장 실패:', esmError)
        throw esmError
      }

      console.log('✅ ESM 응답 저장 완료')

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

      // Entry 저장 후 로그 플러시 (entry가 DB에 저장된 후에 로그 저장)
      try {
        console.log('로그 플러시 시작')
        await flushLogsAfterEntrySave()
        console.log('로그 플러시 완료')
        // ai_prompts 큐도 플러시
        console.log('ai_prompts 플러시 시작')
        await flushAIPromptsAfterEntrySave()
        console.log('ai_prompts 플러시 완료')
      } catch (error) {
        console.error('로그/ai_prompts 플러시 실패')
        // 실패해도 저장은 성공한 것으로 처리
      }

      // 성공 시 처리
      setIsSubmitting(false)
      setShowESM(false)
      router.push('/')
      
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
    return <div>로딩 중...</div>
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
