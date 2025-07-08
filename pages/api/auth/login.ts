import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { 
  withErrorHandler, 
  checkMethod, 
  validateRequired, 
  validateEmail,
  validatePassword,
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

async function loginHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  requestId: string
) {
  // 1. 메서드 검증
  const methodError = checkMethod(req, ['POST'])
  if (methodError) {
    return sendErrorResponse(res, methodError, requestId)
  }

  // 2. 입력값 검증
  const { email, password } = req.body
  
  const validationError = validateRequired(req.body, ['email', 'password'])
  if (validationError) {
    return sendErrorResponse(res, validationError, requestId)
  }

  // 이메일 형식 검증
  if (!validateEmail(email)) {
    const emailError = createApiError(
      ErrorCode.VALIDATION_ERROR,
      '올바른 이메일 형식이 아닙니다.',
      400
    )
    return sendErrorResponse(res, emailError, requestId)
  }

  // 패스워드 검증
  const passwordValidation = validatePassword(password)
  if (!passwordValidation.isValid) {
    const passwordError = createApiError(
      ErrorCode.VALIDATION_ERROR,
      passwordValidation.message!,
      400
    )
    return sendErrorResponse(res, passwordError, requestId)
  }

  console.log('🔐 로그인 시도:', email, `[${requestId}]`)

  // 3. Supabase 인증
  const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
    email,
    password
  })

  if (authError) {
    console.error('❌ 인증 실패:', authError.message, `[${requestId}]`)
    
    // 사용자 친화적 에러 메시지
    let errorMessage = '로그인에 실패했습니다.'
    let errorCode = ErrorCode.AUTHENTICATION_ERROR
    
    if (authError.message.includes('Invalid login credentials')) {
      errorMessage = '이메일 또는 비밀번호가 올바르지 않습니다.'
    } else if (authError.message.includes('Email not confirmed')) {
      errorMessage = '이메일 인증이 필요합니다.'
    } else if (authError.message.includes('Too many requests')) {
      errorMessage = '너무 많은 시도입니다. 잠시 후 다시 시도해주세요.'
      errorCode = ErrorCode.RATE_LIMIT
    }
    
    const authenticationError = createApiError(
      errorCode,
      errorMessage,
      401,
      { supabaseError: authError.message }
    )
    return sendErrorResponse(res, authenticationError, requestId)
  }

  if (!authData.session || !authData.user) {
    console.error('❌ 세션 생성 실패', `[${requestId}]`)
    const sessionError = createApiError(
      ErrorCode.AUTHENTICATION_ERROR,
      '세션 생성에 실패했습니다.',
      401
    )
    return sendErrorResponse(res, sessionError, requestId)
  }

  console.log('✅ 인증 성공:', authData.user.id, `[${requestId}]`)

  // 4. 사용자 정보 조회 (service_role 사용)
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authData.user.id)
    .single()

  if (userError) {
    console.error('❌ 사용자 정보 조회 실패:', userError, `[${requestId}]`)
    
    // 사용자 정보가 없으면 기본 정보로 생성
    if (userError.code === 'PGRST116') { // No rows found
      console.log('👤 신규 사용자, 기본 정보 생성', `[${requestId}]`)
      
      const newUserData = {
        id: authData.user.id,
        email: authData.user.email!,
        name: authData.user.user_metadata?.name || authData.user.email!.split('@')[0],
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
          { dbError: createError }
        )
        return sendErrorResponse(res, createUserError, requestId)
      }

      console.log('✅ 신규 사용자 생성 완료', `[${requestId}]`)
      
      return sendSuccessResponse(res, {
        session: authData.session,
        user: createdUser
      }, '로그인 성공 (신규 사용자)')
    } else {
      const userQueryError = createApiError(
        ErrorCode.DATABASE_ERROR,
        '사용자 정보 조회에 실패했습니다.',
        500,
        { dbError: userError }
      )
      return sendErrorResponse(res, userQueryError, requestId)
    }
  }

  console.log('✅ 로그인 완료:', userData.participant_code, `[${requestId}]`)

  // 5. 성공 응답
  sendSuccessResponse(res, {
    session: authData.session,
    user: userData
  }, '로그인 성공')
}

export default withErrorHandler(loginHandler) 