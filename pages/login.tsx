// pages/login.tsx
import { useState } from 'react'
import { useRouter } from 'next/router'
import { Button, TextInput, Heading, Section } from '../components'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [participantCode, setParticipantCode] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleAuth = async () => {
    if (isLoading) return // 중복 실행 방지
    
    setIsLoading(true)
    
    try {
      if (isSignUp) {
        // 회원가입 - 서버사이드 API 호출
        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            email, 
            password, 
            name, 
            participant_code: participantCode.trim() || undefined 
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          const errorMessage = data.error || data.message || '회원가입에 실패했습니다.'
          alert(errorMessage)
          console.error('❌ 회원가입 에러:', data)
          return
        }

        console.log('✅ 회원가입 성공:', data.message)
        
        // 세션이 포함된 경우 localStorage에 저장
        if (data.data?.session) {
          localStorage.setItem('supabase_session', JSON.stringify(data.data.session))
          console.log('🔐 세션 저장 완료')
          
          // 회원가입 후 설문 페이지로 이동 (profile 설정을 위해)
          await router.push('/survey')
        } else {
          // 이메일 인증 필요한 경우
          alert(data.message || '회원가입이 완료되었습니다.')
          setIsSignUp(false) // 로그인 폼으로 전환
        }
        
      } else {
        // 로그인 - 서버사이드 API 호출
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        })

        const data = await response.json()

        if (!response.ok) {
          const errorMessage = data.error || data.message || '로그인에 실패했습니다.'
          alert(errorMessage)
          console.error('❌ 로그인 에러:', data)
          return
        }

        console.log('✅ 로그인 성공:', data.data.user.participant_code)
        
        // 세션을 localStorage에 저장
        if (data.data?.session) {
          localStorage.setItem('supabase_session', JSON.stringify(data.data.session))
          console.log('🔐 세션 저장 완료')
        }
        
        // 메인 페이지로 이동
        await router.push('/')
      }
      
    } catch (error) {
      console.error('❌ 인증 처리 중 오류:', error)
      alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Section className="w-full max-w-md mx-auto">
        <Heading level={1} className="text-center mb-6">{isSignUp ? '회원가입' : '로그인'}</Heading>
        {isSignUp && (
          <>
            <TextInput
              type="text"
              placeholder="이름 또는 닉네임"
              value={name}
              onChange={setName}
              className="w-full mb-3 p-2 border"
            />
            <TextInput
              type="text"
              placeholder="참가자번호"
              value={participantCode}
              onChange={setParticipantCode}
              className="w-full mb-3 p-2 border"
            />
          </>
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
        <Button 
          onClick={handleAuth} 
          className="w-full"
          disabled={isLoading}
        >
          {isLoading 
            ? (isSignUp ? '가입 처리 중...' : '로그인 중...') 
            : (isSignUp ? '가입하기' : '로그인')
          }
        </Button>
        <p className="mt-4 text-sm text-center">
          {isSignUp ? '이미 계정이 있나요?' : '계정이 없나요?'}{' '}
          <Button 
            className="ml-2 !bg-white !text-black font-bold border border-gray-400 hover:!bg-gray-50" 
            onClick={() => setIsSignUp(!isSignUp)}
            disabled={isLoading}
          >
            {isSignUp ? '로그인' : '회원가입'}
          </Button>
        </p>
      </Section>
    </div>
  )
}
