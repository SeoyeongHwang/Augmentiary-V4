import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Heading, Card, Textarea, TextInput } from './index'
import { ArrowUturnLeftIcon, ArrowUturnRightIcon, BookmarkSquareIcon } from "@heroicons/react/24/outline";
import CircleIconButton from './CircleIconButton';

export default function Editor({ userId }: { userId: string }) {
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [augments, setAugments] = useState<{ start: number; end: number; inserted: string }[]>([])
  const [beliefSummary, setBeliefSummary] = useState('')
  const [augmentOptions, setAugmentOptions] = useState<string[] | null>(null)
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [loading, setLoading] = useState(false)

  // 사용자 프로필 가져오기
  useEffect(() => {
    const fetchBelief = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('profile')
        .eq('id', userId)
        .single()
      if (!error && data?.profile) {
        console.log('🔍 Editor.tsx data.profile 디버깅:', {
          profile: data.profile,
          type: typeof data.profile,
          isString: typeof data.profile === 'string',
          isObject: typeof data.profile === 'object'
        })
        
        let profileContent = ''
        if (typeof data.profile === 'string') {
          profileContent = data.profile.trim()
        } else if (typeof data.profile === 'object' && data.profile !== null) {
          profileContent = JSON.stringify(data.profile)
        }
        
        if (profileContent) {
          setBeliefSummary(profileContent)
        }
      }
    }
    if (userId) fetchBelief()
  }, [userId])

  const handleAugment = async () => {
    if (loading) return
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = text.slice(start, end)
    if (!selected.trim()) return alert('텍스트를 선택하세요.')
    setLoading(true)
    setSelectionRange({ start, end })
    const diaryEntryMarked = text.slice(0, end) + ' <<INSERT HERE>> ' + text.slice(end)
    try {
      const res = await fetch('/api/augment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          diaryEntry: text,
          diaryEntryMarked: diaryEntryMarked,
          userProfile: beliefSummary,
        }),
      })
      const data = await res.json()
      if (data.interpretiveAgentResult) {
        setAugmentOptions([
          data.interpretiveAgentResult.option1.text,
          data.interpretiveAgentResult.option2.text,
          data.interpretiveAgentResult.option3.text,
        ])
      }
    } catch (error) {
      console.error('Error fetching augment options:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyAugmentation = (inserted: string) => {
    if (!selectionRange) return
    const { end } = selectionRange
    const newText = text.slice(0, end) + inserted + text.slice(end)
    setText(newText)
    setAugments((prev) => [...prev, { start: end, end: end + inserted.length, inserted }])
    setAugmentOptions(null)
    setSelectionRange(null)
  }

  const handleUndo = () => {
    if (augments.length === 0) return

    const lastAugment = augments[augments.length - 1]
    const newText = 
      text.slice(0, lastAugment.start - 2) + 
      text.slice(lastAugment.end)

    setText(newText)
    setAugments(augments.slice(0, -1))
  }

  const handleRedo = () => {
    // Redo 기능은 복잡하므로 여기서는 간단히 구현하지 않음

  }

  return (
    <div className="flex flex-row h-full w-full overflow-hidden">
      {/* 왼쪽 버튼 패널 */}
      <div className="hidden md:flex md:w-64 border-r flex-shrink-0 flex-col justify-start px-4 space-y-2 items-end space-y-4">
        <CircleIconButton onClick={handleUndo} aria-label="되돌리기" >
          <ArrowUturnLeftIcon className="h-5 w-5 text-gray-700" />
        </CircleIconButton>
        <CircleIconButton onClick={handleRedo} aria-label="다시하기" >
          <ArrowUturnRightIcon className="h-5 w-5 text-gray-700" />
        </CircleIconButton>
        <CircleIconButton onClick={() => {}} aria-label="저장하기기" >
          <BookmarkSquareIcon className="h-5 w-5 text-gray-700" />
        </CircleIconButton>
      </div>
      {/* 에디터 */}
      <div className="w-full flex-1 min-h-0 flex flex-col items-center justify-start overflow-y-auto p-4">
        <div className="w-full max-w-4xl flex flex-col">
          <TextInput 
            type='text' 
            className='w-full text-4xl font-extrabold text-center mb-4 border-none overflow-auto focus:outline-none focus:border-none focus:ring-0 focus:underline focus:underline-offset-4' 
            placeholder='어울리는 제목을 붙여주세요' 
            value={title} 
            onChange={setTitle} 
          />
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={setText}
            placeholder="있었던 일에 대해 자유롭게 써보세요."
            disabled={loading}
          />
        </div>
        
      </div>
      {/* 오른쪽 디스플레이 패널 */}
      <aside className="hidden md:flex md:w-96 border-l px-4 flex-shrink-0 flex-col overflow-y-auto">
        <div className="flex flex-col space-y-4">
          <Button onClick={handleAugment} disabled={loading} className="px-4 py-2 rounded">
            {loading ? '고민하는 중...' : '더 생각해보기'}
          </Button>
          {/* 증강 옵션 */}
          {augmentOptions && (
            <Card>
              <Heading level={4}>어떤 문장을 추가할까요?</Heading>
              <ul className="space-y-2">
                {augmentOptions.map((option, idx) => (
                  <li key={idx}>
                    <button
                      onClick={() => applyAugmentation(option)}
                      className="text-left bg-white border px-4 py-2 rounded hover:bg-indigo-100"
                    >
                      {option}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {/* 추가된 문장 */}
          {augments.length > 0 && (
            <div className="mt-4 text-sm text-gray-700">
              <strong>추가된 문장:</strong>
              {augments.map((a, i) => (
                <p key={i} className="text-blue-700 italic mt-2">
                  {a.inserted}
                </p>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
