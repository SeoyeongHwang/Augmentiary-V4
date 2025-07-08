import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { 
  withErrorHandler, 
  checkMethod, 
  extractAccessToken,
  createApiError,
  ErrorCode,
  sendSuccessResponse,
  sendErrorResponse
} from '../../../lib/apiErrorHandler'

// 서버 사이드에서 service_role 사용
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// 클라이언트용 supabase (인증용)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function sessionHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  requestId: string
) {
  // 1. 메서드 검증
  const methodError = checkMethod(req, ['GET', 'POST'])
  if (methodError) {
    return sendErrorResponse(res, methodError, requestId)
  }

  // 2. 액세스 토큰 추출
  const accessToken = extractAccessToken(req)
  
  if (!accessToken) {
    const tokenError = createApiError(
      ErrorCode.AUTHENTICATION_ERROR,
      '액세스 토큰이 필요합니다.',
      401,
      { isLoggedIn: false }
    )
    return sendErrorResponse(res, tokenError, requestId)
  }

  console.log('🔍 세션 확인 시도', `[${requestId}]`)

  // 3. 액세스 토큰으로 사용자 정보 조회
  const { data: authUser, error: authError } = await supabaseAuth.auth.getUser(accessToken)

  if (authError || !authUser.user) {
    console.log('❌ 세션 만료 또는 무효:', authError?.message, `[${requestId}]`)
    
    const sessionError = createApiError(
      ErrorCode.AUTHENTICATION_ERROR,
      '세션이 만료되었습니다.',
      401,
      { isLoggedIn: false, authError: authError?.message }
    )
    return sendErrorResponse(res, sessionError, requestId)
  }

  console.log('✅ 유효한 토큰:', authUser.user.id, `[${requestId}]`)

  // 4. 사용자 정보 조회 (service_role 사용)
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.user.id)
    .single()

  if (userError) {
    console.error('❌ 사용자 정보 조회 실패:', userError, `[${requestId}]`)
    
    // 사용자 정보가 없으면 기본 정보로 생성
    if (userError.code === 'PGRST116') { // No rows found
      console.log('👤 사용자 정보 없음, 기본 정보 생성', `[${requestId}]`)
      
      const newUserData = {
        id: authUser.user.id,
        email: authUser.user.email!,
        name: authUser.user.user_metadata?.name || authUser.user.email!.split('@')[0],
        participant_code: `P${Date.now()}`
      }

      const { data: createdUser, error: createError } = await supabase
        .from('users')
        .insert(newUserData)
        .select()
        .single()

      if (createError) {
        console.error('❌ 사용자 생성 실패:', createError, `[${requestId}]`)
        
        const createUserError = createApiError(
          ErrorCode.DATABASE_ERROR,
          '사용자 정보 생성에 실패했습니다.',
          500,
          { isLoggedIn: false, dbError: createError }
        )
        return sendErrorResponse(res, createUserError, requestId)
      }

      console.log('✅ 사용자 정보 생성 완료', `[${requestId}]`)
      
      return sendSuccessResponse(res, {
        isLoggedIn: true,
        user: createdUser
      }, '세션 확인 완료 (신규 사용자 생성)')
    } else {
      const userQueryError = createApiError(
        ErrorCode.DATABASE_ERROR,
        '사용자 정보 조회에 실패했습니다.',
        500,
        { isLoggedIn: false, dbError: userError }
      )
      return sendErrorResponse(res, userQueryError, requestId)
    }
  }

  console.log('✅ 세션 확인 완료:', userData.participant_code, `[${requestId}]`)

  // 5. POST 요청시 토큰 갱신 처리
  if (req.method === 'POST') {
    const { refresh_token } = req.body
    
    if (refresh_token) {
      console.log('🔄 토큰 갱신 시도', `[${requestId}]`)
      
      const { data: sessionData, error: refreshError } = await supabaseAuth.auth.refreshSession({
        refresh_token
      })

      if (refreshError) {
        console.error('❌ 토큰 갱신 실패:', refreshError.message, `[${requestId}]`)
        
        const refreshTokenError = createApiError(
          ErrorCode.AUTHENTICATION_ERROR,
          '토큰 갱신에 실패했습니다.',
          401,
          { isLoggedIn: false, refreshError: refreshError.message }
        )
        return sendErrorResponse(res, refreshTokenError, requestId)
      }

      console.log('✅ 토큰 갱신 완료', `[${requestId}]`)
      
      return sendSuccessResponse(res, {
        isLoggedIn: true,
        user: userData,
        session: sessionData.session
      }, '토큰 갱신 완료')
    }
  }

  // 6. 성공 응답
  sendSuccessResponse(res, {
    isLoggedIn: true,
    user: userData
  }, '세션 확인 완료')
}

export default withErrorHandler(sessionHandler) 