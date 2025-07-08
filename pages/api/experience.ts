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
} from '../../lib/apiErrorHandler'
import { callExperienceAgent, callExperienceDescriptionAgent } from '../../lib/experienceAgent'

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





async function experienceHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  requestId: string
) {
  // 1. 메서드 검증
  const methodError = checkMethod(req, ['POST'])
  if (methodError) {
    return sendErrorResponse(res, methodError, requestId)
  }

  console.log('💭 경험 떠올리기 요청', `[${requestId}]`)

  // 2. 요청 데이터 검증
  const { selectedText, currentEntryId, participantCode } = req.body
  
  if (!selectedText || typeof selectedText !== 'string') {
    const validationError = createApiError(
      ErrorCode.VALIDATION_ERROR,
      '선택된 텍스트가 필요합니다.',
      400
    )
    return sendErrorResponse(res, validationError, requestId)
  }

  if (!participantCode || typeof participantCode !== 'string') {
    const validationError = createApiError(
      ErrorCode.VALIDATION_ERROR,
      '참가자 코드가 필요합니다.',
      400
    )
    return sendErrorResponse(res, validationError, requestId)
  }

  console.log('✅ 경험 떠올리기 - 선택된 텍스트:', selectedText.substring(0, 100), `[${requestId}]`)

  // 3. 현재 엔트리를 제외한 이전 엔트리들 조회
  let query = supabase
    .from('entries')
    .select('id, title, content_html, created_at, sum_innerstate, sum_insight')
    .eq('participant_code', participantCode)
    .order('created_at', { ascending: false })

  // 현재 엔트리 제외
  if (currentEntryId) {
    query = query.neq('id', currentEntryId)
  }

  const { data: entries, error: entriesError } = await query

  if (entriesError) {
    console.error('❌ 엔트리 조회 실패:', entriesError, `[${requestId}]`)
    
    const entriesQueryError = createApiError(
      ErrorCode.DATABASE_ERROR,
      '이전 일기를 가져오는 데 실패했습니다.',
      500,
      { dbError: entriesError }
    )
    return sendErrorResponse(res, entriesQueryError, requestId)
  }

  if (!entries || entries.length === 0) {
    console.log('📝 이전 일기가 없습니다', `[${requestId}]`)
    
    return sendSuccessResponse(res, {
      experiences: [],
      selectedText: selectedText
    }, '이전 일기가 없습니다.')
  }

  // 7. 유사도 계산 및 관련 경험 찾기
  const experiencePromises = entries.map(async (entry) => {
    let totalSimilarity = 0
    let validFields = 0
    let reasons: string[] = []

    // sum_innerstate와 비교
    if (entry.sum_innerstate) {
      const analysis = await callExperienceAgent(selectedText, entry.sum_innerstate, 'innerstate')
      totalSimilarity += analysis.similarity
      validFields++
      if (analysis.reason) {
        reasons.push(`내면상태: ${analysis.reason}`)
      }
    }

    // sum_insight와 비교
    if (entry.sum_insight) {
      const analysis = await callExperienceAgent(selectedText, entry.sum_insight, 'insight')
      totalSimilarity += analysis.similarity
      validFields++
      if (analysis.reason) {
        reasons.push(`깨달음: ${analysis.reason}`)
      }
    }

    // 평균 유사도 계산
    const avgSimilarity = validFields > 0 ? totalSimilarity / validFields : 0

    return {
      ...entry,
      similarity: avgSimilarity,
      analysisReasons: reasons
    }
  })

  const experiencesWithSimilarity = await Promise.all(experiencePromises)

  // 8. 유사도가 높은 순으로 정렬하고 상위 3개 선택
  const topExperiences = experiencesWithSimilarity
    .filter(exp => exp.similarity > 0.1) // 최소 유사도 필터링
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3)

  console.log(`📊 상위 경험 ${topExperiences.length}개 선택됨`, `[${requestId}]`)

  // 9. 각 선택된 경험에 대해 상세 설명 및 전략 생성
  const experiencesWithDescriptions = await Promise.all(
    topExperiences.map(async (exp) => {
      try {
        const descriptionResult = await callExperienceDescriptionAgent(selectedText, {
          id: exp.id,
          sum_innerstate: exp.sum_innerstate,
          sum_insight: exp.sum_insight,
          content: exp.content_html
        })

        return {
          id: exp.id,
          title: exp.title,
          content: exp.content_html,
          created_at: exp.created_at,
          sum_innerstate: exp.sum_innerstate,
          sum_insight: exp.sum_insight,
          similarity: exp.similarity,
          analysisReasons: exp.analysisReasons || [],
          strategy: descriptionResult.strategy,
          description: descriptionResult.description
        }
      } catch (error) {
        console.error(`❌ 경험 설명 생성 실패 (ID: ${exp.id}):`, error, `[${requestId}]`)
        // 에러가 발생해도 기본 데이터는 반환
        return {
          id: exp.id,
          title: exp.title,
          content: exp.content_html,
          created_at: exp.created_at,
          sum_innerstate: exp.sum_innerstate,
          sum_insight: exp.sum_insight,
          similarity: exp.similarity,
          analysisReasons: exp.analysisReasons || [],
          strategy: '과거 경험 떠올려보기',
          description: '관련된 과거 경험이 있습니다.'
        }
      }
    })
  )

  console.log(`✅ 경험 떠올리기 완료: ${experiencesWithDescriptions.length}개 발견`, `[${requestId}]`)

  // 10. 성공 응답
  sendSuccessResponse(res, {
    experiences: experiencesWithDescriptions,
    selectedText: selectedText,
    totalEntriesChecked: entries.length
  }, `${experiencesWithDescriptions.length}개의 관련 경험을 찾았습니다.`)
}

export default withErrorHandler(experienceHandler) 