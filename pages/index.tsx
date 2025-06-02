// pages/index.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/router'
import { User } from '@supabase/supabase-js'
import Editor from '../components/Editor'
import EntryList from '../components/EntryList' 

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()

  useEffect(() => {
    const fetchSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
      } else {
        setUser(session.user)
      }
    }

    fetchSession()
  }, [router])

  return (
    <div className="p-4">
      <h1 className="text-2xl">오늘의 일기</h1>
      {user && (
        <>
        <p className='mb-4 text-gray-600'>환영합니다, {user.email}</p>
        <Editor userId={user.id} />
        {/* <EntryList userId={user.id} />  */}
        <div className='mt-4'></div>
        </>
        )}

      <button onClick={() => {
        supabase.auth.signOut()
        router.push('/login')
      }} className="w-50 bg-blue-500 text-white p-2 rounded">로그아웃</button>

    </div>
  )
  
}