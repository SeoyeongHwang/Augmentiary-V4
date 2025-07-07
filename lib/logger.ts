import { supabase } from './supabase'
import { ActionType, CreateInteractionLogData } from '../types/log'
import { getCurrentKST } from './time'

/**
 * 인터랙션 로그를 Supabase에 기록하는 함수
 */
export async function logInteraction(data: CreateInteractionLogData & { timestamp: string }): Promise<void> {
  try {
    const { error } = await supabase
      .from('interaction_logs')
      .insert([data])
    if (error) {
      // console.error('로그 기록 실패:', error)
      console.error('로그 기록 실패')
    }
  } catch (error) {
    // console.error('로그 기록 중 예외 발생:', error)
    console.error('로그 기록 중 예외 발생')
  }
}

/**
 * 배치 로그 기록을 위한 큐 시스템
 */
class LogQueue {
  private queue: (CreateInteractionLogData & { timestamp: string })[] = []
  private isProcessing = false
  private batchSize = 10
  // 자동 flush 비활성화 - entry 저장 후 수동으로 flush
  // private flushInterval = 5000 // 5초마다 플러시

  constructor() {
    // 자동 flush 비활성화 - entry 저장 후 수동으로 flush
    // setInterval(() => {
    //   this.flush()
    // }, this.flushInterval)
  }

  add(data: CreateInteractionLogData): void {
    // 로그가 큐에 쌓일 때 timestamp를 즉시 할당
    this.queue.push({
      ...data,
      timestamp: getCurrentKST(),
    })
    
    // 자동 flush 비활성화 - entry 저장 후 수동으로 flush
    // if (this.queue.length >= this.batchSize) {
    //   this.flush()
    // }
  }

  async flush(): Promise<void> {
    // console.log('🔄 LogQueue.flush() 시작')
    // console.log('📊 현재 큐 상태:', { queueLength: this.queue.length, isProcessing: this.isProcessing })
    // console.log('⏭️ flush 건너뜀:', { isProcessing: this.isProcessing, queueLength: this.queue.length })
    // console.log('📦 배치 처리 시작:', { batchSize: batch.length })
    // console.log('💾 Supabase에 로그 저장 시도...')
    // console.log('✅ 배치 로그 저장 성공')
    // console.error('❌ 배치 로그 기록 실패:', error)
    // console.error('❌ 배치 로그 기록 중 예외 발생:', error)
    // console.log('🏁 LogQueue.flush() 완료')
    if (this.isProcessing || this.queue.length === 0) {
      // 상태만 남김
      console.log('flush 건너뜀')
      return
    }
    this.isProcessing = true
    const batch = this.queue.splice(0, this.batchSize)
    try {
      const { error } = await supabase
        .from('interaction_logs')
        .insert(batch)
      if (error) {
        // console.error('❌ 배치 로그 기록 실패:', error)
        console.error('배치 로그 기록 실패')
        this.queue.unshift(...batch)
      } else {
        // console.log('✅ 배치 로그 저장 성공')
        console.log('배치 로그 저장 성공')
      }
    } catch (error) {
      // console.error('❌ 배치 로그 기록 중 예외 발생:', error)
      console.error('배치 로그 기록 중 예외 발생')
      this.queue.unshift(...batch)
    } finally {
      this.isProcessing = false
      // console.log('🏁 LogQueue.flush() 완료')
      console.log('LogQueue.flush() 완료')
    }
  }

  // 페이지 언로드 시 남은 로그들을 모두 플러시
  async flushAll(): Promise<void> {
    if (this.queue.length > 0) {
      await this.flush()
    }
  }

  // 큐에 있는 데이터를 반환하고 큐를 비움 (서버 사이드 저장용)
  getQueuedLogs(): (CreateInteractionLogData & { timestamp: string })[] {
    const logs = [...this.queue]
    this.queue = []
    return logs
  }
}

// 전역 로그 큐 인스턴스
export const logQueue = new LogQueue()

/**
 * 비동기 로그 기록 (큐 사용)
 */
export function logInteractionAsync(data: CreateInteractionLogData): void {
  logQueue.add(data)
}

/**
 * 즉시 로그 기록 (동기)
 */
export function logInteractionSync(data: CreateInteractionLogData): Promise<void> {
  // 동기 기록도 timestamp를 즉시 할당
  return logInteraction({ ...data, timestamp: getCurrentKST() })
}

/**
 * 페이지 언로드 시 남은 로그들을 플러시
 */
export async function flushLogs(): Promise<void> {
  await logQueue.flushAll()
}

/**
 * entry 저장 후 로그를 수동으로 플러시 (entry 저장 성공 후 호출)
 */
export async function flushLogsAfterEntrySave(): Promise<void> {
  // console.log('📝 Entry 저장 후 로그 플러시 시작')
  // console.log('📊 큐에 남은 로그 개수:', logQueue['queue'].length)
  try {
    await logQueue.flush()
    // console.log('✅ 로그 플러시 완료')
    console.log('로그 플러시 완료')
  } catch (error) {
    // console.error('❌ 로그 플러시 실패:', error)
    console.error('로그 플러시 실패')
    throw error
  }
}

/**
 * 큐에 있는 로그 데이터를 가져와서 반환 (서버 사이드 저장용)
 */
export function getQueuedLogsForServerSide(): (CreateInteractionLogData & { timestamp: string })[] {
  return logQueue.getQueuedLogs()
}

// 페이지 언로드 시 로그 플러시 비활성화 - entry 저장 후 수동으로만 flush
// if (typeof window !== 'undefined') {
//   window.addEventListener('beforeunload', flushLogs)
//   window.addEventListener('pagehide', flushLogs)
// }

function generateEntryId(participantCode: string): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const h = pad(now.getHours());
  const min = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  return `${participantCode}-${y}${m}${d}T${h}${min}${s}`;
}
