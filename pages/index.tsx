// pages/index.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/router'
import { User } from '@supabase/supabase-js'
//import EntryList from '../components/EntryList' 
import { Editor, Button, Card, TextInput, Textarea, Heading, Section } from '../components'

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
    <Section> 
      <Heading level={1}>오늘의 일기</Heading>
      {user && (
        <>
        <Heading level={4}>환영합니다, {user.email}</Heading>
        <Button onClick={() => {
          supabase.auth.signOut()
          router.push('/login')
        }}>로그아웃</Button>

        <Editor userId={user.id} />
        {/* <EntryList userId={user.id} />  */}
        </>
        )}

    </Section>
  )
  
}