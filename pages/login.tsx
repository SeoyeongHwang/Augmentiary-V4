// pages/login.tsx
import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { Button, TextInput, Heading, Section } from '../components'


export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const router = useRouter()

  const handleAuth = async () => {
    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      alert(error.message)
    } else {
      router.push('/') // 로그인 성공 시 메인 페이지로 이동
    }
  }

  return (
    <Section>
      <Heading level={1}>{isSignUp ? '회원가입' : '로그인'}</Heading>
      <TextInput
        type="email"
        placeholder="이메일"
        value={email}
        onChange={setEmail}
        className="w-full mb-3 p-2 border"
      />
      <TextInput
        type="password"
        placeholder="비밀번호"
        value={password}
        onChange={setPassword}
        className="w-full mb-3 p-2 border"
      />
      <Button onClick={handleAuth} className="w-full bg-blue-500 text-white p-2 rounded">
        {isSignUp ? '가입하기' : '로그인'}
      </Button>
      <p className="mt-4 text-sm text-center">
        {isSignUp ? '이미 계정이 있나요?' : '계정이 없나요?'}{' '}
        <Button className="text-blue-500 underline" onClick={() => setIsSignUp(!isSignUp)}>
          {isSignUp ? '로그인' : '회원가입'}
        </Button>
      </p>
    </Section>
  )
}
