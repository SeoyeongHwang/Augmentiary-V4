import { XMarkIcon } from "@heroicons/react/24/outline"
import { Card } from './index'
import { formatKST } from '../lib/time'

type JournalModalProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  content: string
  createdAt: string
}

export default function JournalModal({ isOpen, onClose, title, content, createdAt }: JournalModalProps) {
  if (!isOpen) return null

  // 날짜 포맷팅 (KST 기준)
  const formatDate = (dateString: string) => {
    return formatKST(dateString)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 배경 오버레이 */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* 모달 내용 */}
      <div className="relative w-full max-w-2xl h-[80vh] flex flex-col">
        <Card className="relative flex flex-col h-full">
          {/* 헤더 영역 (고정) */}
          <div className="flex-shrink-0 pb-4 border-b border-gray-200">
            {/* 닫기 버튼 */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors z-10"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
            
            {/* 제목과 날짜 */}
            <div className="pr-12">
              <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
              <p className="text-sm text-gray-500">{formatDate(createdAt)}</p>
            </div>
          </div>
          
          {/* 본문 영역 (스크롤 가능) */}
          <div className="flex-1 overflow-y-auto mt-4">
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </div>
        </Card>
      </div>
    </div>
  )
} 