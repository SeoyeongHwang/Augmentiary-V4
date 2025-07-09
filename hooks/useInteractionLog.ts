import { useCallback } from 'react'
import { ActionType, CreateInteractionLogData } from '../types/log'
import { logInteractionAsync, logInteractionSync } from '../lib/logger'
import { useSession } from './useSession'

/**
 * 인터랙션 로그를 기록하는 커스텀 훅
 */
export function useInteractionLog() {
  const { user } = useSession()

  /**
   * 비동기 로그 기록 (큐 사용, UX에 영향 없음)
   */
  const logAsync = useCallback((
    actionType: ActionType,
    meta?: Record<string, any>,
    entryId?: string
  ) => {
    if (!user?.participant_code || !entryId) {
      // entryId가 없으면 기록하지 않음
      return
    }

    const logData: CreateInteractionLogData = {
      participant_code: user.participant_code,
      action_type: actionType,
      meta,
      entry_id: entryId
    }

    logInteractionAsync(logData)
  }, [user?.participant_code])

  /**
   * 동기 로그 기록 (즉시 저장, 중요한 액션용)
   */
  const logSync = useCallback(async (
    actionType: ActionType,
    meta?: Record<string, any>,
    entryId?: string
  ) => {
    if (!user?.participant_code || !entryId) {
      return
    }

    const logData: CreateInteractionLogData = {
      participant_code: user.participant_code,
      action_type: actionType,
      meta,
      entry_id: entryId
    }

    await logInteractionSync(logData)
  }, [user?.participant_code])

  /**
   * AI 호출 로그
   */
  const logAITrigger = useCallback((entryId: string, selectedText: string) => {
    logAsync(ActionType.TRIGGER_AI, { selectedText }, entryId)
  }, [logAsync])

  /**
   * AI 응답 수신 로그
   */
  const logAIReceive = useCallback((entryId: string, aiSuggestions: any) => {
    logAsync(ActionType.RECEIVE_AI, { 
      aiSuggestions,
      // optionCount: aiSuggestions.length 
    }, entryId)
  }, [logAsync])

  /**
   * AI 텍스트 삽입 로그
   */
  const logAITextInsert = useCallback((entryId: string, selectedOption: any) => {
    logAsync(ActionType.INSERT_AI_TEXT, { 
      selectedOption
    }, entryId)
  }, [logAsync])

  /**
   * 엔트리 저장 로그
   */
  const logEntrySave = useCallback((entryId: string) => {
    logAsync(ActionType.SAVE_ENTRY, undefined, entryId)
  }, [logAsync])

  /**
   * ESM 트리거 로그 (ESM 모달 표시)
   */
  const logTriggerESM = useCallback((entryId: string) => {
    logAsync(ActionType.TRIGGER_ESM, undefined, entryId)
  }, [logAsync])

  /**
   * ESM 제출 로그
   */
  const logESMSubmit = useCallback((entryId: string, consent: boolean) => {
    logAsync(ActionType.SUBMIT_ESM, { consent }, entryId)
  }, [logAsync])

  /**
   * 글쓰기 시작 로그
   */
  const logStartWriting = useCallback((entryId: string) => {
    logAsync(ActionType.START_WRITING, undefined, entryId)
  }, [logAsync])

  /**
   * 로그아웃 로그 (entryId 필요 없음)
   */
  const logLogout = useCallback(() => {
    logSync(ActionType.LOGOUT)
  }, [logSync])

  /**
   * 경험 살펴보기 요청 로그
   */
  const logRequestRecord = useCallback((entryId: string, selectedText: string) => {
    logAsync(ActionType.REQUEST_RECORD, { selectedText }, entryId)
  }, [logAsync])

  /**
   * 경험 살펴보기 응답 수신 로그
   */
  const logReceiveRecord = useCallback((entryId: string, records: any) => {
    logAsync(ActionType.RECEIVE_RECORD, { 
      records: records,
      recordCount: records.length 
    }, entryId)
  }, [logAsync])

  /**
   * 일기 열어보기 로그
   */
  const logCheckRecord = useCallback((entryId: string, originalEntryId: string) => {
    logAsync(ActionType.CHECK_RECORD, { 
      originalEntryId 
    }, entryId)
  }, [logAsync])

  return {
    // 기본 로그 함수들
    logAsync,
    logSync,
    
    // 특정 액션 로그 함수들
    logAITrigger,
    logAIReceive,
    logAITextInsert,
    logEntrySave,
    logTriggerESM,
    logESMSubmit,
    logStartWriting,
    logLogout,
    
    // 경험 살펴보기 기능 로그 함수들
    logRequestRecord,
    logReceiveRecord,
    logCheckRecord,
    
    // 사용자 정보 확인
    canLog: !!user?.participant_code
  }
}
