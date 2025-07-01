// components/EntryList.tsx

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatKST } from '../lib/time'

type Props = {
  userId: string
}

import type { Entry } from '../types/entry'

type EntryWithFeedback = Entry & {
  feedback?: string
}

export default function EntryList({ userId }: Props) {
  const [entries, setEntries] = useState<EntryWithFeedback[]>([])
  const [loading, setLoading] = useState(true)

  // 일기 목록 불러오기
  useEffect(() => {
    const fetchEntries = async () => {
      const { data, error } = await supabase
        .from('entries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('불러오기 실패:', error)
      } else {
        setEntries(data)
      }
      setLoading(false)
    }

    fetchEntries()
  }, [userId])

  return (
    <div className="mt-8">
        <h2 className="text-lg font-semibold mb-2">📘 이전 일기 목록</h2>

        {loading && <p>불러오는 중...</p>}

        {entries.length === 0 && !loading && (
            <p className="text-gray-500">아직 저장된 일기가 없습니다.</p>
        )}

        <ul className="space-y-4">
        {entries.map((entry) => (
            <li key={entry.id} className="p-4 border rounded">
            <p className="text-sm text-gray-400 mb-1">
                {formatKST(entry.created_at)}
            </p>
            <p className="mb-2 whitespace-pre-wrap">{entry.content_html}</p>
            {entry.feedback && (
                <div className="mt-2 p-2 bg-purple-50 border rounded text-sm">
                <p className="font-semibold mb-1">💬 AI 피드백</p>
                <p>{entry.feedback}</p>
                </div>
            )}
            </li>
        ))}
        </ul>
    </div>
  )
}
