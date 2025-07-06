import React, { useState } from 'react'
import { useInteractionLog } from '../hooks/useInteractionLog'
import { ActionType } from '../types/log'

/**
 * 인터랙션 로그 사용 예시 컴포넌트
 */
export function LogExample() {
  const [text, setText] = useState('')
  const [selectedText, setSelectedText] = useState('')
  const { 
    logStartWriting,
    logAITrigger,
    logAIReceive,
    logAITextInsert,
    logEntrySave,
    logESMSubmit,
    logLogout,
    logAsync,
    canLog
  } = useInteractionLog()

  const handleTextSelection = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    const selection = target.value.substring(target.selectionStart, target.selectionEnd)
    
    if (selection) {
      setSelectedText(selection)
      // 텍스트 선택 로그 (entryId가 필요하므로 임시로 사용)
      logAsync(ActionType.SELECT_TEXT, { selectedText: selection }, 'example-entry-id')
    } else {
      setSelectedText('')
      // 텍스트 선택 해제 로그
      logAsync(ActionType.DESELECT_TEXT, undefined, 'example-entry-id')
    }
  }

  const handleAITrigger = () => {
    if (selectedText) {
      logAITrigger('example-entry-id', selectedText)
      
      // AI 응답 시뮬레이션
      setTimeout(() => {
        const aiSuggestions = {
          option1: {
            strategy: "Exploratory insight generation",
            title: "깊이 있는 탐색",
            text: `because ${selectedText} is important to me`
          },
          option2: {
            strategy: "Positive reframing and redemption",
            title: "긍정적 재해석",
            text: `perhaps ${selectedText} shows my growth`
          },
          option3: {
            strategy: "Action-oriented behavioral guidance",
            title: "행동 지향적 안내",
            text: `I could use ${selectedText} to improve myself`
          }
        }
        logAIReceive('example-entry-id', aiSuggestions)
        logAITextInsert('example-entry-id', aiSuggestions.option1)
        
        // AI 텍스트를 본문에 추가
        const newText = text + ' ' + aiSuggestions.option1.text
        setText(newText)
      }, 1000)
    }
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value
    if (text !== newText) {
      // 간단한 수정 감지 (실제로는 더 정교한 diff 알고리즘 사용)
      if (newText.length > text.length) {
        logAsync(ActionType.EDIT_MANUAL_TEXT, { 
          originalText: text, 
          newText 
        }, 'example-entry-id')
      }
      setText(newText)
    }
  }

  const handleSave = () => {
    logEntrySave('example-entry-id')
    alert('저장되었습니다!')
  }

  const handleESMSubmit = () => {
    logESMSubmit('example-entry-id', true)
    alert('ESM 응답이 제출되었습니다!')
  }

  const handleLogout = () => {
    logLogout()
    alert('로그아웃되었습니다!')
  }

  const handleStartWriting = () => {
    logStartWriting('example-entry-id')
    alert('글쓰기를 시작합니다!')
  }

  if (!canLog) {
    return (
      <div className="p-4 border rounded-lg bg-gray-50">
        <h3 className="text-lg font-semibold mb-2">로그 기록 예시</h3>
        <p className="text-gray-600">로그인 후 사용자 정보가 필요합니다.</p>
      </div>
    )
  }

  return (
    <div className="p-6 border rounded-lg bg-white shadow-sm">
      <h3 className="text-lg font-semibold mb-4">인터랙션 로그 기록 예시</h3>
      
      <div className="space-y-4">
        {/* 글쓰기 시작 */}
        <div>
          <button 
            onClick={handleStartWriting}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            글쓰기 시작
          </button>
        </div>

        {/* 텍스트 입력 및 선택 */}
        <div>
          <label className="block text-sm font-medium mb-2">텍스트 입력:</label>
          <textarea
            value={text}
            onChange={handleTextChange}
            onMouseUp={handleTextSelection}
            className="w-full p-2 border rounded resize-none h-32"
            placeholder="텍스트를 입력하고 선택해보세요..."
          />
        </div>

        {/* 선택된 텍스트 표시 */}
        {selectedText && (
          <div className="p-2 bg-yellow-100 rounded">
            <span className="text-sm font-medium">선택된 텍스트:</span>
            <p className="mt-1">{selectedText}</p>
          </div>
        )}

        {/* AI 호출 버튼 */}
        <div>
          <button 
            onClick={handleAITrigger}
            disabled={!selectedText}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300"
          >
            AI 제안 요청
          </button>
        </div>

        {/* 기타 액션들 */}
        <div className="flex gap-2 flex-wrap">
          <button 
            onClick={handleSave}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            저장
          </button>
          
          <button 
            onClick={handleESMSubmit}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            ESM 제출
          </button>
          
          <button 
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            로그아웃
          </button>
        </div>

        {/* 로그 상태 표시 */}
        <div className="mt-4 p-3 bg-gray-50 rounded">
          <h4 className="font-medium mb-2">로그 기록 상태:</h4>
          <ul className="text-sm space-y-1">
            <li>✅ 사용자 정보: {canLog ? '확인됨' : '없음'}</li>
            <li>✅ 비동기 로그 큐: 활성화</li>
            <li>✅ KST 시간 기준: 설정됨</li>
          </ul>
        </div>
      </div>
    </div>
  )
} 