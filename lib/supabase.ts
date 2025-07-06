import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 환경 변수 확인 로깅
// console.log('🔍 Supabase 환경 변수 확인:', {
//   hasUrl: !!supabaseUrl,
//   hasKey: !!supabaseAnonKey,
//   urlLength: supabaseUrl?.length,
//   keyLength: supabaseAnonKey?.length,
//   url: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'undefined',
//   key: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 10)}...` : 'undefined'
// })

let supabase: any

try {
  console.log('🔧 Supabase 클라이언트 생성 시도...')
  supabase = createClient(supabaseUrl, supabaseAnonKey)
  console.log('✅ Supabase 클라이언트 생성 성공')
} catch (error) {
  console.error('❌ Supabase 클라이언트 생성 실패:', error)
  throw error
}

export { supabase }