// pages/login.tsx
import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { Button, TextInput, Heading, Section } from '../components'
import type { CreateUserData } from '../types/user'


export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const router = useRouter()

  const handleAuth = async () => {
    if (isSignUp) {
      // 회원가입
      const { data, error } = await supabase.auth.signUp({ email, password })
      
      if (error) {
        alert(error.message)
        return
      }

      if (data.user) {
        // users 테이블에 사용자 정보 저장
        const userData: CreateUserData = {
          id: data.user.id,
          email: email,
          name: name,
          participant_code: `P${Date.now()}` // 임시로 타임스탬프 기반 코드 생성
        }

        const { error: userError } = await supabase
          .from('users')
          .insert(userData)

        if (userError) {
          console.error('사용자 정보 저장 실패:', userError)
          alert('사용자 정보 저장에 실패했습니다.')
          return
        }
      }
    } else {
      // 로그인
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      
      if (error) {
        alert(error.message)
        return
      }
    }

    router.push('/') // 로그인/회원가입 성공 시 메인 페이지로 이동
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Section className="w-full max-w-md mx-auto">
        <Heading level={1} className="text-center mb-6">{isSignUp ? '회원가입' : '로그인'}</Heading>
        {isSignUp && (
          <TextInput
            type="text"
            placeholder="이름"
            value={name}
            onChange={setName}
            className="w-full mb-3 p-2 border"
          />
        )}
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
        <Button onClick={handleAuth} className="w-full">
          {isSignUp ? '가입하기' : '로그인'}
        </Button>
        <p className="mt-4 text-sm text-center">
          {isSignUp ? '이미 계정이 있나요?' : '계정이 없나요?'}{' '}
          <Button className="!bg-white !text-black font-bold border border-gray-400 hover:!bg-gray-50" onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? '로그인' : '회원가입'}
          </Button>
        </p>
      </Section>
    </div>
  )
}
