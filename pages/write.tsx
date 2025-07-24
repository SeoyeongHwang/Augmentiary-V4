import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '../utils/supabase/client'
import { ArrowLeftIcon } from "@heroicons/react/24/outline"
import { TiptapEditor2, Button, ESMModal } from '../components'
import ConfirmModal from '../components/ConfirmModal'
import { LogStatus } from '../components/LogStatus'
import type { ESMData } from '../components/ESMModal'
import type { CreateESMResponseData } from '../types/esm'
import type { CreateEntryData } from '../types/entry'
import { getCurrentKST } from '../lib/time'

import { useInteractionLog } from '../hooks/useInteractionLog'
import { useSession } from '../hooks/useSession'
import { generateEntryId } from '../utils/entry'
import { getQueuedLogsForServerSide } from '../lib/logger'
import { getQueuedAIPromptsForServerSide } from '../utils/aiPromptQueue'

export default function Write() {
  const { user, loading, refreshSession, checkSession } = useSession()
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
    // 로딩 중이면 기다림
    if (loading) {
      return
    }
    
    // 로딩 완료 후 사용자 정보 없으면 로그인 페이지로 이동
    if (!user) {
      console.log('🔒 인증되지 않은 사용자 - 로그인 페이지로 이동')
      router.push('/login')
      return
    }
    
    // useSession에서 이미 participant_code를 포함한 user 정보를 가져오므로 직접 사용
    if (user.participant_code) {
      setParticipantCode(user.participant_code)
    } else {
      console.error('❌ participant_code가 없습니다.')
      alert('참가자 정보를 확인할 수 없습니다. 다시 로그인해주세요.')
      router.push('/login')
    }
  }, [user, loading, router])

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

  // 추가 메트릭 데이터를 저장할 상태
  const [additionalMetrics, setAdditionalMetrics] = useState<{
    leftPanelRequests: number
    rightPanelRequests: number
    leftPanelInsertions: number
    rightPanelInsertions: number
    aiTextsAdded: Array<{
      text: string
      type: 'experience' | 'generation'
      timestamp: string
      source: 'left' | 'right'
      metadata?: any
    }>
    syllableCount: number
  } | null>(null)

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

    // 💡 저장 전 세션 유효성 확인 및 자동 갱신
    console.log('🔍 저장 전 세션 유효성 확인 중...')
    try {
      const sessionCheck = await checkSession()
      if (!sessionCheck.success) {
        if (sessionCheck.needsLogin) {
          alert('세션이 만료되었습니다. 다시 로그인해주세요.')
          router.push('/login')
          return
        }
      }
      console.log('✅ 세션 유효성 확인 완료')
    } catch (error) {
      console.error('❌ 세션 유효성 확인 실패:', error)
      alert('세션 확인 중 오류가 발생했습니다. 다시 시도해주세요.')
      return
    }

    console.log('📊 [WRITE] 저장 시점 메트릭 상태:', {
      hasMetrics: !!additionalMetrics,
      leftPanelRequests: additionalMetrics?.leftPanelRequests || 0,
      rightPanelRequests: additionalMetrics?.rightPanelRequests || 0,
      leftPanelInsertions: additionalMetrics?.leftPanelInsertions || 0,
      rightPanelInsertions: additionalMetrics?.rightPanelInsertions || 0,
      aiTextsCount: additionalMetrics?.aiTextsAdded?.length || 0,
      syllableCount: additionalMetrics?.syllableCount || 0
    })

    // ESM 트리거 로그 (ESM 모달 표시)
    if (canLog) {
      logTriggerESM(entryId)
    }

    setShowESM(true)
  }

  // 에디터에서 메트릭 업데이트 받는 함수
  const handleMetricsChange = useCallback((metrics: {
    leftPanelRequests: number
    rightPanelRequests: number
    leftPanelInsertions: number
    rightPanelInsertions: number
    aiTextsAdded: Array<{
      text: string
      type: 'experience' | 'generation'
      timestamp: string
      source: 'left' | 'right'
      metadata?: any
    }>
    syllableCount: number
  }) => {
    setAdditionalMetrics(metrics)
    console.log('📊 [WRITE] 에디터에서 메트릭 업데이트:', {
      leftPanelRequests: metrics.leftPanelRequests,
      rightPanelRequests: metrics.rightPanelRequests,
      leftPanelInsertions: metrics.leftPanelInsertions,
      rightPanelInsertions: metrics.rightPanelInsertions,
      aiTextsCount: metrics.aiTextsAdded?.length || 0,
      syllableCount: metrics.syllableCount
    })
  }, [])

  const [isSubmitting, setIsSubmitting] = useState(false)

  // 저장 중일 때 창 닫기 방지
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSubmitting) {
        e.preventDefault()
        e.returnValue = '일기 저장이 진행 중입니다. 지금 나가시면 저장되지 않을 수 있습니다.'
        return '일기 저장이 진행 중입니다. 지금 나가시면 저장되지 않을 수 있습니다.'
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isSubmitting])

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

    // 💡 ESM 제출 전 세션 유효성 재확인 (더블 체크)
    console.log('🔍 ESM 제출 전 세션 재확인 중...')
    try {
      const sessionRecheck = await checkSession()
      if (!sessionRecheck.success) {
        if (sessionRecheck.needsLogin) {
          setIsSubmitting(false)
          alert('세션이 만료되었습니다. 저장을 위해 다시 로그인해주세요.')
          router.push('/login')
          return
        }
      }
      console.log('✅ ESM 제출 전 세션 재확인 완료')
    } catch (error) {
      console.error('❌ ESM 제출 전 세션 재확인 실패:', error)
      setIsSubmitting(false)
      alert('세션 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      return
    }

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
        shared: true, // ESM에서 consent 필드가 제거되었으므로 기본값으로 true 설정
        created_at: getCurrentKST()
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
        SL: esmData.SL,
        SO: esmData.SO,
        REF1: esmData.REF1,
        REF2: esmData.REF2,
        RUM1: esmData.RUM1,
        RUM2: esmData.RUM2,
        THK1: esmData.THK1,
        THK2: esmData.THK2
      }
      
      // 큐에 있는 로그와 AI 프롬프트 데이터 가져오기
      const logsData = getQueuedLogsForServerSide()
      const aiPromptsData = getQueuedAIPromptsForServerSide()
      
      // AI 프롬프트 데이터를 서버에서 처리할 수 있도록 변환
      const processedAIPromptsData = aiPromptsData.map(prompt => ({
        ...prompt,
        ai_suggestion: (() => {
          // 이미 문자열인 경우 파싱 후 다시 문자열로 변환 (이중 인코딩 방지)
          if (typeof prompt.ai_suggestion === 'string') {
            try {
              const parsed = JSON.parse(prompt.ai_suggestion)
              return JSON.stringify(parsed)
            } catch {
              return prompt.ai_suggestion
            }
          }
          // 객체인 경우 문자열로 변환
          return JSON.stringify(prompt.ai_suggestion)
        })()
      }))
      
      // 추가 메트릭 데이터를 완전히 안전하게 정리 (메타데이터 제외)
      const safeAdditionalMetrics = additionalMetrics ? {
        leftPanelRequests: Number(additionalMetrics.leftPanelRequests) || 0,
        rightPanelRequests: Number(additionalMetrics.rightPanelRequests) || 0,
        leftPanelInsertions: Number(additionalMetrics.leftPanelInsertions) || 0,
        rightPanelInsertions: Number(additionalMetrics.rightPanelInsertions) || 0,
        syllableCount: Number(additionalMetrics.syllableCount) || 0,
        // AI 텍스트와 안전한 메타데이터 저장
        aiTextsAdded: Array.isArray(additionalMetrics.aiTextsAdded) ? 
          additionalMetrics.aiTextsAdded.map((item, index) => {
            try {
              // 안전한 메타데이터 처리
              const safeMetadata: any = {};
              if (item?.metadata && typeof item.metadata === 'object') {
                // 허용된 메타데이터 키들만 포함
                const allowedKeys = ['strategy', 'originalEntryId', 'title', 'isPastContext', 'sum_innerstate', 'sum_insight', 'created_at', 'approach', 'resource', 'index', 'category', 'confidence'];
                
                for (const key of allowedKeys) {
                  const value = item.metadata[key];
                  if (value !== undefined && value !== null) {
                    if (typeof value === 'string') {
                      safeMetadata[key] = value.substring(0, 200); // 문자열 길이 제한
                    } else if (typeof value === 'number' || typeof value === 'boolean') {
                      safeMetadata[key] = value; // 원시 타입은 그대로
                    }
                  }
                }
              }
              
              return {
                text: typeof item?.text === 'string' ? item.text.substring(0, 200) : '', 
                type: (item?.type === 'experience' || item?.type === 'generation') ? item.type : 'generation',
                timestamp: typeof item?.timestamp === 'string' ? item.timestamp : new Date().toISOString(),
                source: (item?.source === 'left' || item?.source === 'right') ? item.source : 'right',
                metadata: safeMetadata
              };
            } catch (error) {
              console.warn(`AI 텍스트 ${index} 정리 중 오류:`, error);
              return {
                text: '',
                type: 'generation',
                timestamp: new Date().toISOString(),
                source: 'right',
                metadata: {}
              };
            }
          }) : []
      } : null;
      
             // 전송 전 JSON 검증 (매우 엄격)
       let finalMetrics = null;
       console.log('🔍 [WRITE] additionalMetrics 존재 여부:', !!additionalMetrics);
       console.log('🔍 [WRITE] safeAdditionalMetrics 존재 여부:', !!safeAdditionalMetrics);
       
       if (safeAdditionalMetrics) {
         // 안전한 로그 출력 (AI 텍스트 배열 요약)
         const logSafeMetrics = {
           leftPanelRequests: safeAdditionalMetrics.leftPanelRequests,
           rightPanelRequests: safeAdditionalMetrics.rightPanelRequests,
           leftPanelInsertions: safeAdditionalMetrics.leftPanelInsertions,
           rightPanelInsertions: safeAdditionalMetrics.rightPanelInsertions,
           syllableCount: safeAdditionalMetrics.syllableCount,
           aiTextsCount: safeAdditionalMetrics.aiTextsAdded?.length || 0
         };
         console.log('🔍 [WRITE] safeAdditionalMetrics 내용:', logSafeMetrics);
         
         try {
           // 이중 검증: 직렬화 테스트
           const testSerialization = JSON.stringify(safeAdditionalMetrics);
           JSON.parse(testSerialization); // 역직렬화도 테스트
           
           finalMetrics = safeAdditionalMetrics;
           console.log('📊 [WRITE] 안전한 메트릭 검증 완료:', logSafeMetrics);
         } catch (error) {
           console.error('❌ [WRITE] 메트릭 JSON 검증 실패, 기본값 사용:', error);
           // 가장 안전한 기본값만 전송
           try {
             finalMetrics = {
               leftPanelRequests: Number(additionalMetrics?.leftPanelRequests) || 0,
               rightPanelRequests: Number(additionalMetrics?.rightPanelRequests) || 0,
               leftPanelInsertions: Number(additionalMetrics?.leftPanelInsertions) || 0,
               rightPanelInsertions: Number(additionalMetrics?.rightPanelInsertions) || 0,
               syllableCount: Number(additionalMetrics?.syllableCount) || 0,
               aiTextsAdded: []
             };
             // 기본값도 검증
             JSON.stringify(finalMetrics);
             console.log('📊 [WRITE] 기본 메트릭 사용:', finalMetrics);
           } catch (fallbackError) {
             console.error('❌ [WRITE] 기본 메트릭도 실패, 메트릭 전송 안함:', fallbackError);
             finalMetrics = null; // 메트릭 전송하지 않음
           }
         }
       } else {
         console.log('⚠️ [WRITE] safeAdditionalMetrics가 null이라서 메트릭 전송 안함');
       }
      
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
          aiPromptsData: processedAIPromptsData,
          additionalMetrics: finalMetrics
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
          logESMSubmit(entryId, true) // ESM에서 consent 필드가 제거되었으므로 기본값으로 true 설정
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
      
      // 세션 만료 관련 에러인지 확인
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
      if (errorMessage.includes('세션') || errorMessage.includes('토큰') || errorMessage.includes('인증')) {
        alert(`인증 오류가 발생했습니다: ${errorMessage}\n\n잠시 후 다시 시도하거나, 필요시 다시 로그인해주세요.`)
        
        // 세션 재확인 시도
        try {
          const sessionRecheck = await checkSession()
          if (!sessionRecheck.success && sessionRecheck.needsLogin) {
            console.log('🔒 저장 실패 후 세션 재확인 결과: 로그인 필요')
            localStorage.removeItem('supabase_session')
            router.push('/login')
            return
          }
        } catch (recheckError) {
          console.error('세션 재확인 중 오류:', recheckError)
        }
      } else {
        // 일반적인 저장 오류
        alert(`저장 중 오류가 발생했습니다: ${errorMessage}\n\n네트워크 연결을 확인하고 다시 시도해주세요.`)
      }
    }
  }

  const handleBack = () => {
    if (isSubmitting) {
      return
    }
    setShowConfirmModal(true)
  }

  const handleConfirmBack = () => {
    setShowConfirmModal(false)
    router.push('/')
  }

  const handleCancelBack = () => {
    setShowConfirmModal(false)
  }

  // 로딩 중이거나 사용자 정보가 없거나 entryId가 없으면 로딩 화면 표시
  if (loading || !user || !entryId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-lg text-gray-600">로딩 중...</div>
          <div className="text-sm text-gray-400 mt-2">
            {loading ? '사용자 세션 확인 중' : !user ? '사용자 정보 확인 중' : '글쓰기 준비 중'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#faf9f5]">
      {/* 저장 중 안내 메시지 */}
      {isSubmitting && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="flex items-center justify-center space-x-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-600"></div>
            <div className="text-center">
              <p className="text-sm text-amber-800 font-medium">
                일기를 저장하고 있습니다...
              </p>
              <p className="text-xs text-amber-700">
                완료될 때까지 창을 닫지 말아주세요!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <header className="bg-transparent px-6 py-4 flex-shrink-0">
        <div className="bg-transparent flex items-center justify-between">
          <button
            onClick={handleBack}
            className={`flex items-center ${isSubmitting ? 'text-gray-400 cursor-not-allowed' : 'text-gray-600 hover:text-gray-900'}`}
            disabled={isSubmitting}
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            뒤로가기
          </button>
          <h1 className="text-lg font-semibold text-gray-900"> </h1>
          <Button
            onClick={handleSave}
            className="px-6 py-2 bg-stone-700 text-white hover:bg-stone-800"
            disabled={!entryId || isSubmitting}
          >
            {isSubmitting ? '저장 중...' : '저장하기'}
          </Button>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto lg:overflow-hidden">
        <TiptapEditor2 
          userId={user?.id || ''}
          entryId={entryId}
          onTitleChange={setTitle}
          onContentChange={setContent}
          onSave={handleSave}
          onMetricsChange={handleMetricsChange}
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
        isOpen={showConfirmModal && !isSubmitting}
        onConfirm={handleConfirmBack}
        onCancel={handleCancelBack}
        title="메인 화면으로 나가기"
        message="저장되지 않은 정보는 사라집니다. 나가시겠습니까?"
        confirmText="나가기"
        cancelText="취소"
      />
    </div>
  )
}
