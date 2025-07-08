import { supabase } from './supabase'

// 서머리 에이전트 결과 타입 정의
export interface SummaryAgentResult {
  sum_event: string
  sum_innerstate: string
  sum_insight: string
}

// 서머리 에이전트 - 일기 내용을 3가지 요약으로 분석
export async function callSummaryAgent(
  diaryContent: string,
  entryId: string,
  participantCode: string
): Promise<SummaryAgentResult> {
  try {
    const prompt = `
    You are a narrative analysis expert.
    Please extract and concisely summarize the following three elements from the provided diary entry:

    1. sum_event: What happened (objective facts such as situations, events, or activities)
    2. sum_innerstate: Internal state (subjective experiences such as emotions, thoughts, or reactions)
    3. sum_insight: Insights and realizations (what was learned, gained, or the meaning derived from the experience)

    Each summary should be 1–2 sentences long, maintaining the diary writer's perspective and tone.
    Do not distort the facts, and base the summaries strictly on the content provided.
    If there is no content relevant to a particular category, return an empty string for that category. Response in Korean.

    Output in JSON format:
    {
      "sum_event": "<<<TEXT>>>",
      "sum_innerstate": "<<<TEXT>>>",
      "sum_insight": "<<<TEXT>>>"
    }
    `

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `Diary content: \n${diaryContent}` },
        ],
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API 호출 실패: ${response.status}`)
    }

    const data = await response.json()
    const textResult = data.choices?.[0]?.message?.content || ''
    
    try {
      const jsonStart = textResult.indexOf('{')
      const jsonEnd = textResult.lastIndexOf('}')
      
      if (jsonStart === -1 || jsonEnd === -1) {
        console.error('서머리 에이전트 JSON 브래킷을 찾을 수 없음')
        return { sum_event: '', sum_innerstate: '', sum_insight: '' }
      }
      
      const jsonString = textResult.substring(jsonStart, jsonEnd + 1)
      const parsedResult = JSON.parse(jsonString)
      
      const summaryResult = {
        sum_event: parsedResult.sum_event || '',
        sum_innerstate: parsedResult.sum_innerstate || '',
        sum_insight: parsedResult.sum_insight || ''
      }
      
      return summaryResult
    } catch (err) {
      console.error('서머리 에이전트 JSON 파싱 오류:', err)
      console.error('원본 응답:', textResult)
      return { sum_event: '', sum_innerstate: '', sum_insight: '' }
    }
  } catch (error) {
    console.error('서머리 에이전트 API 호출 오류:', error)
    return { sum_event: '', sum_innerstate: '', sum_insight: '' }
  }
}

// entries 테이블의 요약 필드 업데이트 (service_role 사용)
export async function updateEntrySummary(
  entryId: string,
  summaryData: SummaryAgentResult,
  supabaseClient: any
): Promise<void> {
  try {
    console.log('🔄 업데이트 시작:', { entryId, summaryData })
    
    const { data, error } = await supabaseClient
      .from('entries')
      .update({
        sum_event: summaryData.sum_event,
        sum_innerstate: summaryData.sum_innerstate,
        sum_insight: summaryData.sum_insight
      })
      .eq('id', entryId)
      .select() // 업데이트된 결과를 반환하도록 추가

    if (error) {
      console.error('❌ 일기 요약 업데이트 실패:', error)
      throw error
    } else {
      console.log('✅ 일기 요약 업데이트 성공:', entryId)
      console.log('📝 업데이트된 데이터:', data)
    }
  } catch (error) {
    console.error('❌ 일기 요약 업데이트 중 오류:', error)
    throw error
  }
} 