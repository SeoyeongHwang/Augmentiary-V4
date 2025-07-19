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

async function signupHandler(
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
  const { email, password, name, participant_code } = req.body
  
  const validationError = validateRequired(req.body, ['email', 'password', 'name'])
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

  // 이름 검증
  if (name.trim().length < 2) {
    const nameError = createApiError(
      ErrorCode.VALIDATION_ERROR,
      '이름은 2자 이상이어야 합니다.',
      400
    )
    return sendErrorResponse(res, nameError, requestId)
  }

  // 참가자번호 검증 (입력된 경우)
  if (participant_code && participant_code.trim()) {
    const trimmedCode = participant_code.trim()
    
    // 참가자번호 형식 검증 (예: 영문자, 숫자, 하이픈만 허용)
    if (!/^[a-zA-Z0-9-_]+$/.test(trimmedCode)) {
      const codeFormatError = createApiError(
        ErrorCode.VALIDATION_ERROR,
        '참가자번호는 영문자, 숫자, 하이픈(-), 언더스코어(_)만 사용할 수 있습니다.',
        400
      )
      return sendErrorResponse(res, codeFormatError, requestId)
    }
    
    // 참가자번호 길이 검증
    if (trimmedCode.length < 2 || trimmedCode.length > 50) {
      const codeLengthError = createApiError(
        ErrorCode.VALIDATION_ERROR,
        '참가자번호는 2자 이상 50자 이하여야 합니다.',
        400
      )
      return sendErrorResponse(res, codeLengthError, requestId)
    }
  }

  console.log('📝 회원가입 시도:', email, `[${requestId}]`)

  // 3. 이메일 중복 검사 (service_role로 직접 확인)
  const { data: existingUser, error: checkError } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single()

  if (existingUser) {
    const duplicateError = createApiError(
      ErrorCode.CONFLICT,
      '이미 가입된 이메일입니다.',
      409
    )
    return sendErrorResponse(res, duplicateError, requestId)
  }

  // 3-1. 참가자번호 중복 검사 (입력된 경우)
  if (participant_code && participant_code.trim()) {
    const { data: existingParticipant, error: participantCheckError } = await supabase
      .from('users')
      .select('id')
      .eq('participant_code', participant_code.trim())
      .single()

    if (existingParticipant) {
      const participantDuplicateError = createApiError(
        ErrorCode.CONFLICT,
        '이미 사용 중인 참가자번호입니다.',
        409
      )
      return sendErrorResponse(res, participantDuplicateError, requestId)
    }
  }

  // 4. Supabase 인증 계정 생성
  const { data: authData, error: authError } = await supabaseAuth.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: name.trim()
      }
    }
  })

  if (authError) {
    console.error('❌ 회원가입 실패:', authError.message, `[${requestId}]`)
    
    // 사용자 친화적 에러 메시지
    let errorMessage = '회원가입에 실패했습니다.'
    let errorCode = ErrorCode.VALIDATION_ERROR
    
    if (authError.message.includes('User already registered')) {
      errorMessage = '이미 가입된 이메일입니다.'
      errorCode = ErrorCode.CONFLICT
    } else if (authError.message.includes('Password should be at least')) {
      errorMessage = '비밀번호가 너무 약합니다.'
    } else if (authError.message.includes('Signup is disabled')) {
      errorMessage = '현재 회원가입이 비활성화되어 있습니다.'
      errorCode = ErrorCode.SERVER_ERROR
    }
    
    const signupError = createApiError(
      errorCode,
      errorMessage,
      400,
      { supabaseError: authError.message }
    )
    return sendErrorResponse(res, signupError, requestId)
  }

  if (!authData.user) {
    console.error('❌ 사용자 생성 실패', `[${requestId}]`)
    const userCreationError = createApiError(
      ErrorCode.SERVER_ERROR,
      '계정 생성에 실패했습니다.',
      500
    )
    return sendErrorResponse(res, userCreationError, requestId)
  }

  console.log('✅ 인증 계정 생성 성공:', authData.user.id, `[${requestId}]`)

  // 5. 참가자번호 결정 (입력되지 않은 경우 자동 생성)
  let finalParticipantCode = participant_code?.trim()
  
  if (!finalParticipantCode) {
    // 자동 생성 로직
    let attempts = 0
    const maxAttempts = 10
    
    while (attempts < maxAttempts) {
      finalParticipantCode = `P${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
      
      // 생성된 코드 중복 검사
      const { data: duplicateCheck } = await supabase
        .from('users')
        .select('id')
        .eq('participant_code', finalParticipantCode)
        .single()
      
      if (!duplicateCheck) {
        break // 중복되지 않으면 사용
      }
      
      attempts++
      if (attempts >= maxAttempts) {
        console.error('❌ 참가자번호 생성 실패 - 최대 시도 횟수 초과', `[${requestId}]`)
        const codeGenerationError = createApiError(
          ErrorCode.SERVER_ERROR,
          '참가자번호 생성에 실패했습니다. 다시 시도해주세요.',
          500
        )
        return sendErrorResponse(res, codeGenerationError, requestId)
      }
    }
  }

  // 6. 사용자 정보 테이블에 저장 (service_role 사용)
  const userData = {
    id: authData.user.id,
    email: email.toLowerCase(),
    name: name.trim(),
    participant_code: finalParticipantCode
  }

  const { data: createdUser, error: userError } = await supabase
    .from('users')
    .insert(userData)
    .select()
    .single()

  if (userError) {
    console.error('❌ 사용자 정보 저장 실패:', userError, `[${requestId}]`)
    
    // 인증 계정은 생성되었지만 사용자 정보 저장 실패
    // 정리 작업 시도
    try {
      await supabase.auth.admin.deleteUser(authData.user.id)
      console.log('🗑️ 실패한 인증 계정 정리 완료', `[${requestId}]`)
    } catch (cleanupError) {
      console.error('❌ 계정 정리 실패:', cleanupError, `[${requestId}]`)
    }
    
    const dbError = createApiError(
      ErrorCode.DATABASE_ERROR,
      '사용자 정보 저장에 실패했습니다.',
      500,
      { dbError: userError }
    )
    return sendErrorResponse(res, dbError, requestId)
  }

  console.log('✅ 회원가입 완료:', finalParticipantCode, `[${requestId}]`)

  // 6. 성공 응답
  const responseData: any = {
    user: createdUser,
    message: '회원가입이 완료되었습니다.'
  }

  // 즉시 로그인 가능한 경우 세션 포함
  if (authData.session) {
    responseData.session = authData.session
    responseData.message = '회원가입 및 로그인이 완료되었습니다.'
    console.log('🔐 즉시 로그인 가능', `[${requestId}]`)
  } else {
    responseData.message = '회원가입이 완료되었습니다. 이메일 인증 후 로그인해주세요.'
    console.log('📧 이메일 인증 필요', `[${requestId}]`)
  }

  sendSuccessResponse(res, responseData, responseData.message, 201)
}

export default withErrorHandler(signupHandler) 