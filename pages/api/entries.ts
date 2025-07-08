import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { callSummaryAgent, updateEntrySummary } from '../../lib/summaryAgent'

// 서버 사이드에서 service_role 사용 (타임아웃 제한 없음)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // service_role 키 사용
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { entryData, esmData, logsData, aiPromptsData } = req.body

    // 1. Entry 저장
    const { data: entryResult, error: entryError } = await supabase
      .from('entries')
      .upsert(entryData)
      .select()

    if (entryError) {
      console.error('❌ Entry 저장 실패:', entryError)
      return res.status(500).json({ 
        error: 'Entry 저장 실패', 
        details: entryError 
      })
    }

    // 2. ESM 응답 저장
    const { data: esmResult, error: esmError } = await supabase
      .from('esm_responses')
      .insert(esmData)
      .select()

    if (esmError) {
      console.error('❌ ESM 저장 실패:', esmError)
      return res.status(500).json({ 
        error: 'ESM 저장 실패', 
        details: esmError 
      })
    }

    // 3. 로그 데이터 저장 (있는 경우)
    if (logsData && logsData.length > 0) {
      const { error: logsError } = await supabase
        .from('interaction_logs')
        .insert(logsData)
      
      if (logsError) {
        console.error('❌ 로그 저장 실패:', logsError)
        // 로그 저장 실패는 전체 프로세스를 중단하지 않음
      }
    }

    // 4. AI 프롬프트 데이터 저장 (있는 경우)
    if (aiPromptsData && aiPromptsData.length > 0) {
      const { error: aiPromptsError } = await supabase
        .from('ai_prompts')
        .insert(aiPromptsData)
      
      if (aiPromptsError) {
        console.error('❌ AI 프롬프트 저장 실패:', aiPromptsError)
        // AI 프롬프트 저장 실패는 전체 프로세스를 중단하지 않음
      }
    }

    // 5. 서머리 에이전트 호출 및 업데이트 (백그라운드 처리)
    if (entryResult && entryResult.length > 0) {
      const savedEntry = entryResult[0]
      
      // 서머리 에이전트를 백그라운드에서 실행
      const runSummaryAgent = async () => {
        try {
          console.log('✅ 서머리 에이전트 호출 시작:', savedEntry.id)
          
          // 서머리 에이전트 호출
          const summaryResult = await callSummaryAgent(
            savedEntry.content_html,
            savedEntry.id,
            savedEntry.participant_code
          )
          
          console.log('✅ 서머리 에이전트 결과:', summaryResult)
          
          // service_role을 사용하여 업데이트
          await updateEntrySummary(savedEntry.id, summaryResult, supabase)
          
        } catch (error) {
          console.error('❌ 서머리 에이전트 전체 프로세스 실패:', error)
        }
      }
      
      // setTimeout을 사용하여 백그라운드에서 실행
      setTimeout(() => {
        runSummaryAgent()
      }, 0)
    }

    res.status(200).json({ 
      success: true, 
      entry: entryResult,
      esm: esmResult,
      logsCount: logsData?.length || 0,
      aiPromptsCount: aiPromptsData?.length || 0
    })

  } catch (error) {
    console.error('❌ 서버 오류:', error)
    res.status(500).json({ 
      error: '서버 오류', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    })
  }
} 