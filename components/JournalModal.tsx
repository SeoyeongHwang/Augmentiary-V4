import { XMarkIcon } from "@heroicons/react/24/outline"
import { Card } from './index'

type JournalModalProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  content: string
  createdAt: string
}

export default function JournalModal({ isOpen, onClose, title, content, createdAt }: JournalModalProps) {
  if (!isOpen) return null

  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* 모달 내용 */}
      <div className="relative w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
        <Card className="relative">
          {/* 닫기 버튼 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
          
          {/* 일기 내용 */}
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
              <p className="text-sm text-gray-500">{formatDate(createdAt)}</p>
            </div>
            
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