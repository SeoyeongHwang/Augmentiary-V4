import { useState } from 'react'
import { Card, Button } from './index'

type ESMModalProps = {
  isOpen: boolean
  onSubmit: (data: ESMData) => void
  onClose: () => void
  isSubmitting?: boolean
}

import type { CreateESMResponseData } from '../types/esm'

export type ESMData = {
  consent: boolean
  q1: number
  q2: number
  q3: number
  q4: number
  q5: number
}

export default function ESMModal({ isOpen, onSubmit, onClose, isSubmitting = false }: ESMModalProps) {
  const [formData, setFormData] = useState<ESMData>({
    consent: true,
    q1: 4,
    q2: 4,
    q3: 4,
    q4: 4,
    q5: 4
  })

  if (!isOpen) return null

  const handleSubmit = () => {
    if (isSubmitting) {
      return
    }

    if (onSubmit) {
      onSubmit(formData)
    }
  }

  const questions = [
    { id: 'q1', label: 'Q1. 시스템과 상호작용하는 동안 내 행동의 주체는 나였습니다.', min: '전혀 동의하지 않음', max: '매우 동의함' },
    { id: 'q2', label: 'Q2. 글을 쓰는 동안 텍스트를 통제하고 있다는 느낌이 들었습니다.', min: '전혀 동의하지 않음', max: '매우 동의함' },
    { id: 'q3', label: 'Q3. (일기에서 주로 묘사된) 이 경험을 이해하게 되었습니다.', min: '전혀 동의하지 않음', max: '매우 동의함' },
    { id: 'q4', label: 'Q4. AI로 생성된 텍스트가 마치 나를 위해 특별히 작성된 것처럼 느껴졌습니다.', min: '전혀 동의하지 않음', max: '매우 동의함' },
    { id: 'q5', label: 'Q5. AI로 생성된 텍스트가 의미나 통찰을 찾는 데 도움이 되었다고 느꼈습니다.', min: '전혀 동의하지 않음', max: '매우 동의함' }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
      {/* 배경 오버레이 */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* 모달 내용 */}
      <div className="relative max-w-lg h-[80vh] flex flex-col">
        <Card className="flex flex-col p-0 h-full">
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">저장하기</h2>
              <p className="text-sm text-gray-600">작성해주신 글을 데이터 분석에 활용해도 괜찮으신가요?<br/>(통계적 패턴 분석 목적)</p>
            </div>

            {/* 동의 토글 */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">데이터 분석에 이 글을 사용하는 것에 동의합니다</span>
              <button
                onClick={() => setFormData(prev => ({ ...prev, consent: !prev.consent }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.consent ? 'bg-emerald-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.consent ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            
            <hr className="my-4" />
            {/* 질문들 */}
            <div className="space-y-4">
              <p className="text-sm text-gray-600">작성 과정을 떠올리며 해당하는 정도를 선택해주세요.</p>

              {questions.map((question) => (
                <div key={question.id} className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">
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
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider accent-emerald-400"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{question.min}</span>
                      <span>{question.max}</span>
                    </div>
                    <div className="w-full flex justify-center">
                      <span className="font-bold text-emerald-600">{formData[question.id as keyof ESMData]}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
          {/* 고정된 버튼 영역 */}
          <div className="flex-shrink-0 pt-4 border-t border-gray-200 bg-white">
            <div className="flex space-x-3">
              <Button
                onClick={onClose}
                className="flex-1 bg-stone-300 text-stone-700 hover:bg-stone-400"
              >
                취소
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1 bg-stone-700 text-white hover:bg-stone-800"
                disabled={isSubmitting}
              >
                {isSubmitting ? '저장 중...' : '저장하고 완료하기'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
} 