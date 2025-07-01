import { Card } from './index'

type JournalCardProps = {
  id: string
  title: string
  content: string
  createdAt: string
  onClick: () => void
}

export default function JournalCard({ id, title, content, createdAt, onClick }: JournalCardProps) {
  // HTML 태그 제거하고 텍스트만 추출
  const stripHtml = (html: string) => {
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    return tmp.textContent || tmp.innerText || ''
  }

  // 내용 미리보기 (100자 제한)
  const preview = stripHtml(content).substring(0, 100) + (stripHtml(content).length > 100 ? '...' : '')

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
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow duration-200"
      onClick={onClick}
    >
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900 line-clamp-2">{title}</h3>
        <p className="text-sm text-gray-600 line-clamp-3">{preview}</p>
        <p className="text-xs text-gray-400">{formatDate(createdAt)}</p>
      </div>
    </Card>
  )
} 