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
    consent: false,
    q1: 4,
    q2: 4,
    q3: 4,
    q4: 4,
    q5: 4
  })

  console.log('ESMModal 렌더링:', { isOpen, formData })

  if (!isOpen) return null

  const handleSubmit = () => {
    console.log('ESM 제출 버튼 클릭:', formData)
    console.log('onSubmit 함수 존재 여부:', !!onSubmit)
    console.log('제출 중인지:', isSubmitting)
    
    if (isSubmitting) {
      console.log('이미 제출 중입니다. 버튼 클릭 무시')
      return
    }
    
    try {
      onSubmit(formData)
      console.log('onSubmit 호출 완료')
    } catch (error) {
      console.error('onSubmit 호출 중 오류:', error)
    }
  }

  const questions = [
    { id: 'q1', label: '시스템과 상호작용하는 동안 내 행동의 주체는 나였습니다.', min: '전혀 동의하지 않음', max: '매우 동의함' },
    { id: 'q2', label: '글을 쓰는 동안 텍스트를 통제하고 있다는 느낌이 들었습니다.', min: '전혀 동의하지 않음', max: '매우 동의함' },
    { id: 'q3', label: '(일기에서 주로 묘사된) 이 경험을 이해하게 되었습니다.', min: '전혀 동의하지 않음', max: '매우 동의함' },
    { id: 'q4', label: 'AI로 생성된 텍스트가 마치 나를 위해 특별히 작성된 것처럼 느껴졌습니다.', min: '전혀 동의하지 않음', max: '매우 동의함' },
    { id: 'q5', label: 'AI로 생성된 텍스트가 의미나 통찰을 찾는 데 도움이 되었다고 느꼈습니다.', min: '전혀 동의하지 않음', max: '매우 동의함' }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
      {/* 배경 오버레이 */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* 모달 내용 */}
      <div className="relative w-full max-w-md h-[90vh] flex flex-col">
        <Card className="flex flex-col p-0 h-full">
          <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">연구 참여 동의</h2>
              <p className="text-sm text-gray-600">이 일기를 연구 목적으로 사용해도 괜찮으신가요?</p>
            </div>

            {/* 동의 토글 */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">결과 분석에 이 일기를 사용하는 것에 동의합니다</span>
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
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{question.min}</span>
                      <span className="font-bold">{formData[question.id as keyof ESMData]}</span>
                      <span>{question.max}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
          {/* 고정된 버튼 영역 */}
          <div className="flex-shrink-0 p-6 pt-4 border-t border-gray-200 bg-white">
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