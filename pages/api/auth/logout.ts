import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { 
  withErrorHandler, 
  checkMethod, 
  sendSuccessResponse
} from '../../../lib/apiErrorHandler'

// 클라이언트용 supabase (인증용)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function logoutHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  requestId: string
) {
  // 1. 메서드 검증
  const methodError = checkMethod(req, ['POST'])
  if (methodError) {
    return sendSuccessResponse(res, {}, '로그아웃되었습니다.') // 로그아웃은 항상 성공으로 처리
  }

  const { access_token } = req.body

  console.log('🚪 로그아웃 요청', `[${requestId}]`)

  // 2. 액세스 토큰이 있으면 검증 및 세션 무효화
  if (access_token) {
    try {
      const { data: user, error: userError } = await supabaseAuth.auth.getUser(access_token)
      
      if (user?.user) {
        console.log('✅ 유효한 세션 로그아웃:', user.user.id, `[${requestId}]`)
        
        // 세션 무효화
        await supabaseAuth.auth.admin.signOut(access_token)
        console.log('🔐 세션 무효화 완료', `[${requestId}]`)
      } else {
        console.log('⚠️ 이미 무효한 토큰 (무시)', `[${requestId}]`)
      }
    } catch (error) {
      console.log('⚠️ 세션 확인 중 오류 (무시):', error, `[${requestId}]`)
    }
  }

  console.log('✅ 로그아웃 완료', `[${requestId}]`)

  // 3. 성공 응답 (토큰이 없거나 무효해도 성공으로 처리)
  sendSuccessResponse(res, {}, '로그아웃되었습니다.')
}

// 로그아웃은 항상 성공으로 처리해야 하므로 에러 핸들러에서도 특별 처리
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await withErrorHandler(logoutHandler)(req, res)
  } catch (error) {
    console.error('❌ 로그아웃 처리 중 서버 오류:', error)
    
    // 로그아웃은 실패해도 성공으로 처리 (클라이언트 측 정리 위해)
    res.status(200).json({
      success: true,
      message: '로그아웃되었습니다.',
      warning: '일부 세션 정리 과정에서 오류가 발생했습니다.',
      timestamp: new Date().toISOString()
    })
  }
} 