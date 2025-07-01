import { useState } from 'react'
import { Card, Button } from './index'

type ESMModalProps = {
  isOpen: boolean
  onSubmit: (data: ESMData) => void
  onClose: () => void
}

export type ESMData = {
  consent: boolean
  q1: number
  q2: number
  q3: number
  q4: number
  q5: number
}

export default function ESMModal({ isOpen, onSubmit, onClose }: ESMModalProps) {
  const [formData, setFormData] = useState<ESMData>({
    consent: false,
    q1: 4,
    q2: 4,
    q3: 4,
    q4: 4,
    q5: 4
  })

  if (!isOpen) return null

  const handleSubmit = () => {
    onSubmit(formData)
  }

  const questions = [
    { id: 'q1', label: '오늘 일기를 쓰면서 어떤 기분이었나요?', min: '매우 부정적', max: '매우 긍정적' },
    { id: 'q2', label: '일기 쓰기가 도움이 되었나요?', min: '전혀 도움 안됨', max: '매우 도움됨' },
    { id: 'q3', label: 'AI 제안이 유용했나요?', min: '전혀 유용하지 않음', max: '매우 유용함' },
    { id: 'q4', label: '앞으로도 이런 도구를 사용하고 싶나요?', min: '전혀 사용하고 싶지 않음', max: '매우 사용하고 싶음' },
    { id: 'q5', label: '전반적인 만족도는 어떠신가요?', min: '매우 불만족', max: '매우 만족' }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* 모달 내용 */}
      <div className="relative w-full max-w-md mx-4">
        <Card className="relative">
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">연구 참여 동의</h2>
              <p className="text-sm text-gray-600">이 일기를 연구 목적으로 사용해도 괜찮으신가요?</p>
            </div>

            {/* 동의 토글 */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">연구에 일기 사용을 허락합니다</span>
              <button
                onClick={() => setFormData(prev => ({ ...prev, consent: !prev.consent }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.consent ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.consent ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* 질문들 */}
            <div className="space-y-4">
              {questions.map((question) => (
                <div key={question.id} className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    {question.label}
                  </label>
                  <div className="space-y-1">
                    <input
                      type="range"
                      min="1"
                      max="7"
                      value={formData[question.id as keyof ESMData] as number}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        [question.id]: parseInt(e.target.value)
                      }))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{question.min}</span>
                      <span className="font-medium">{formData[question.id as keyof ESMData]}</span>
                      <span>{question.max}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 버튼 */}
            <div className="flex space-x-3">
              <Button
                onClick={onClose}
                className="flex-1 bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                취소
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1"
              >
                제출
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
} 