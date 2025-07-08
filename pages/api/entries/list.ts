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

async function listEntriesHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  requestId: string
) {
  // 1. 메서드 검증
  const methodError = checkMethod(req, ['GET'])
  if (methodError) {
    return sendErrorResponse(res, methodError, requestId)
  }

  // 2. 액세스 토큰 추출 및 검증
  const accessToken = extractAccessToken(req)
  
  if (!accessToken) {
    const tokenError = createApiError(
      ErrorCode.AUTHENTICATION_ERROR,
      '인증이 필요합니다.',
      401
    )
    return sendErrorResponse(res, tokenError, requestId)
  }

  console.log('📖 일기 목록 조회 요청', `[${requestId}]`)

  // 3. 토큰으로 사용자 정보 확인
  const { data: authUser, error: authError } = await supabaseAuth.auth.getUser(accessToken)

  if (authError || !authUser.user) {
    console.log('❌ 인증 실패:', authError?.message, `[${requestId}]`)
    
    const authenticationError = createApiError(
      ErrorCode.AUTHENTICATION_ERROR,
      '세션이 만료되었습니다.',
      401,
      { authError: authError?.message }
    )
    return sendErrorResponse(res, authenticationError, requestId)
  }

  // 4. 사용자 정보 조회 (participant_code 필요)
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('participant_code')
    .eq('id', authUser.user.id)
    .single()

  if (userError) {
    console.error('❌ 사용자 정보 조회 실패:', userError, `[${requestId}]`)
    
    const userQueryError = createApiError(
      ErrorCode.DATABASE_ERROR,
      '사용자 정보를 찾을 수 없습니다.',
      404,
      { dbError: userError }
    )
    return sendErrorResponse(res, userQueryError, requestId)
  }

  console.log('✅ 사용자 확인:', userData.participant_code, `[${requestId}]`)

  // 5. 쿼리 파라미터 처리
  const { limit = '9', offset = '0' } = req.query
  const limitNum = Math.min(parseInt(limit as string) || 9, 50) // 최대 50개로 제한
  const offsetNum = Math.max(parseInt(offset as string) || 0, 0)

  // 6. 일기 목록 조회
  const { data: entries, error: entriesError } = await supabase
    .from('entries')
    .select('*')
    .eq('participant_code', userData.participant_code)
    .order('created_at', { ascending: false })
    .range(offsetNum, offsetNum + limitNum - 1)

  if (entriesError) {
    console.error('❌ 일기 목록 조회 실패:', entriesError, `[${requestId}]`)
    
    const entriesQueryError = createApiError(
      ErrorCode.DATABASE_ERROR,
      '일기 목록을 가져오는 데 실패했습니다.',
      500,
      { dbError: entriesError }
    )
    return sendErrorResponse(res, entriesQueryError, requestId)
  }

  console.log(`✅ 일기 목록 조회 성공: ${entries.length}개`, `[${requestId}]`)

  // 7. 성공 응답
  sendSuccessResponse(res, {
    entries: entries || [],
    count: entries.length,
    participant_code: userData.participant_code
  }, `${entries.length}개의 일기를 가져왔습니다.`)
}

export default withErrorHandler(listEntriesHandler) 