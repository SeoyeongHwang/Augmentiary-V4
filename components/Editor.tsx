import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Textarea, Heading, Card } from './index'

export default function Editor({ userId }: { userId: string }) {
  const [text, setText] = useState('')
  const [augments, setAugments] = useState<{ start: number; end: number; inserted: string }[]>([])
  const [beliefSummary, setBeliefSummary] = useState('')
  const [augmentOptions, setAugmentOptions] = useState<string[] | null>(null)
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 사용자 프로필 가져오기
  useEffect(() => {
    const fetchBelief = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('belief_summary')
        .eq('id', userId)
        .single()

      if (!error && data?.belief_summary) {
        setBeliefSummary(data.belief_summary)
      }
    }

    if (userId) fetchBelief()
  }, [userId])

  const handleAugment = async () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = text.slice(start, end)
    if (!selected.trim()) return alert('텍스트를 선택하세요.')

    // const contextBefore = text.slice(Math.max(0, start - 100), start)
    // const contextAfter = text.slice(end, end + 100)

    setSelectionRange({ start, end })

    const diaryEntryMarked = text.slice(0, end) + ' <<INSERT HERE>> ' + text.slice(end)

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
    console.log('Augment API result: ', data)

    if (data.interpretiveAgentResult) {
      setAugmentOptions([
        data.interpretiveAgentResult.option1,
        data.interpretiveAgentResult.option2,
        data.interpretiveAgentResult.option3,
      ]);
    }

    // const res = await fetch('/api/feedback', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ 
    //     content: selected, 
    //     before: contextBefore,
    //     after: contextAfter,
    //     belief: beliefSummary,
    //    }),
    // })
    // const data = await res.json()

    // if (data.options) {
    //   setAugmentOptions(data.options)
    // }
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

  return (
    <div className="mt-6"> 
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={setText}
        placeholder="텍스트를 입력하고 일부 선택 후 증강해보세요."
      />

      <Button onClick={handleAugment}>
         관점 추가하기
      </Button>

      {augmentOptions && (
        <Card>
          <Heading level={4}>어떤 문장을 추가할까요?</Heading>
          <ul className="space-y-2">
            {augmentOptions.map((option, idx) => (
              <li key={idx}>
                <button
                  onClick={() => applyAugmentation(option)}
                  className="text-left w-full bg-white border px-3 py-2 rounded hover:bg-indigo-100"
                >
                  {option}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {augments.length > 0 && (
        <div className="mt-4 text-sm text-gray-700">
          <strong>증강된 텍스트:</strong>
          <ul className="list-disc ml-5">
            {augments.map((a, i) => (
              <li key={i} className="text-blue-700 italic">
                {a.inserted}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
