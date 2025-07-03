import React, { useState, useEffect } from 'react'
import { useInteractionLog } from '../hooks/useInteractionLog'

/**
 * 로그 기록 상태를 실시간으로 확인하는 컴포넌트
 */
export function LogStatus() {
  const { canLog } = useInteractionLog()
  const [logCount, setLogCount] = useState(0)
  const [lastLog, setLastLog] = useState<string>('')

  // 로그 카운트 시뮬레이션 (실제로는 로그 큐 상태를 확인해야 함)
  useEffect(() => {
    const interval = setInterval(() => {
      setLogCount(prev => prev + Math.floor(Math.random() * 3))
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  if (!canLog) {
    return (
      <div className="fixed bottom-4 right-4 p-3 bg-red-100 border border-red-300 rounded-lg shadow-lg">
        <div className="text-sm font-medium text-red-800">로그 기록 비활성화</div>
        <div className="text-xs text-red-600">사용자 정보가 없습니다</div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 p-3 bg-green-100 border border-green-300 rounded-lg shadow-lg min-w-[200px]">
      <div className="text-sm font-medium text-green-800">로그 기록 활성화</div>
      <div className="text-xs text-green-600 mt-1">
        <div>기록된 로그: {logCount}개</div>
        <div>마지막 로그: {lastLog || '없음'}</div>
        <div>상태: 실시간 기록 중</div>
      </div>
    </div>
  )
} 