// lib/experienceAgent.ts

// 경험 분석 에이전트 결과 타입 정의
export interface ExperienceAnalysisResult {
  similarity: number
  reason: string
}

// 경험 설명 에이전트 결과 타입 정의
export interface ExperienceDescriptionResult {
  strategy: string      // 떠올리기 전략 (카드 제목)
  description: string   // 관련성 설명 (카드 본문)
  entry_id: string     // 원본 일기 ID
}

export interface ExperienceAgentResult {
  selectedText: string
  experiences: ExperienceEntry[]
  totalEntriesChecked: number
}

export interface ExperienceEntry {
  id: string
  title: string
  content: string
  created_at: string
  sum_innerstate?: string
  sum_insight?: string
  similarity: number
  analysisReasons: string[]
  // 새로 추가되는 필드들
  strategy?: string
  description?: string
}

// 경험 분석 에이전트 - 선택된 텍스트와 이전 일기의 유사도 분석
export async function callExperienceAgent(
  selectedText: string,
  summaryText: string,
  summaryType: 'innerstate' | 'insight'
): Promise<ExperienceAnalysisResult> {
  try {
    const prompt = `
    You are an expert in analyzing diary entries and understanding emotional and psychological connections between experiences.
    
    I will provide you with:
    1. A selected text from a current diary entry
    2. A ${summaryType === 'innerstate' ? 'summary of inner emotional state' : 'summary of insights/realizations'} from a previous diary entry
    
    Your task is to analyze how similar or related these two pieces of text are in terms of:
    - Emotional themes and feelings
    - Life experiences and situations
    - Personal growth and insights
    - Underlying psychological patterns
    
    Selected text from current entry: "${selectedText}"
    
    Previous entry's ${summaryType === 'innerstate' ? 'inner state' : 'insight'}: "${summaryText}"
    
    Please respond in JSON format with:
    {
      "similarity": <number between 0 and 1>,
      "reason": "<brief explanation in Korean of why they are similar or different>"
    }
    
    Where similarity scores mean:
    - 0.0-0.2: 완전히 다른 주제나 감정
    - 0.3-0.5: 일부 공통점이 있지만 다른 맥락
    - 0.6-0.8: 유사한 감정이나 상황, 관련성이 있음
    - 0.9-1.0: 매우 유사하거나 강한 연관성
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
        ],
        temperature: 0.3,
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
        console.error('경험 에이전트 JSON 브래킷을 찾을 수 없음')
        return { similarity: 0, reason: 'JSON 형식 오류' }
      }
      
      const jsonString = textResult.substring(jsonStart, jsonEnd + 1)
      const parsedResult = JSON.parse(jsonString)
      
      const analysisResult = {
        similarity: Math.min(1, Math.max(0, parseFloat(parsedResult.similarity) || 0)),
        reason: parsedResult.reason || '분석 결과 없음'
      }
      
      return analysisResult
    } catch (err) {
      console.error('경험 에이전트 JSON 파싱 오류:', err)
      console.error('원본 응답:', textResult)
      return { similarity: 0, reason: 'JSON 파싱 실패' }
    }
  } catch (error) {
    console.error('경험 에이전트 API 호출 오류:', error)
    return { similarity: 0, reason: '분석 오류' }
  }
}

// 경험 설명 에이전트 - 선택된 텍스트와 관련된 경험에 대한 상세 설명 및 전략 생성
export async function callExperienceDescriptionAgent(
  selectedText: string,
  experienceData: {
    id: string
    sum_innerstate?: string
    sum_insight?: string
    content?: string
  }
): Promise<ExperienceDescriptionResult> {
  try {
    const prompt = `
    You are an expert in reflective journaling and helping people connect their current experiences with meaningful past experiences.
    
    I will provide you with:
    1. A selected text from a current diary entry
    2. Data from a related past diary entry (inner state summary, insights, or content)
    
    Your task is to:
    1. Create a reflection strategy title that suggests how to recall this past experience
    2. Write a brief description of why this past experience is relevant to the current text
    
    Current selected text: "${selectedText}"
    
    Past experience data:
    ${experienceData.sum_innerstate ? `- Inner state: ${experienceData.sum_innerstate}` : ''}
    ${experienceData.sum_insight ? `- Insights: ${experienceData.sum_insight}` : ''}
    ${experienceData.content ? `- Content preview: ${experienceData.content.substring(0, 200)}...` : ''}
    
         Please respond in JSON format with:
     {
       "strategy": "<Korean title with appropriate emoji suggesting how to recall this experience (e.g., '💭 ~해보기', '🌱 ~돌아보기', '🔄 ~인식하기')>",
       "description": "<Korean description of why this past experience is relevant to current text, 2-3 sentences max>",
       "entry_id": "${experienceData.id}"
     }
     
     Guidelines:
     - Strategy should start with an appropriate emoji that represents the type of reflection
     - Choose emojis that match the thematic context (💭💡🌱🔄💫🎯🪞✨🌅📝💪🤝😌🔍)
     - Strategy should be actionable and specific to the type of connection
     - Description should explain the emotional or situational connection
     - Keep both concise but meaningful
     - Use warm, encouraging tone
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
        ],
        temperature: 0.9,
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
        console.error('경험 설명 에이전트 JSON 브래킷을 찾을 수 없음')
        return { 
          strategy: '과거 경험 떠올려보기', 
          description: '관련된 과거 경험이 있습니다.', 
          entry_id: experienceData.id 
        }
      }
      
      const jsonString = textResult.substring(jsonStart, jsonEnd + 1)
      const parsedResult = JSON.parse(jsonString)
      
      const descriptionResult = {
        strategy: parsedResult.strategy || '과거 경험 떠올려보기',
        description: parsedResult.description || '관련된 과거 경험이 있습니다.',
        entry_id: experienceData.id
      }
      
      return descriptionResult
    } catch (err) {
      console.error('경험 설명 에이전트 JSON 파싱 오류:', err)
      console.error('원본 응답:', textResult)
      return { 
        strategy: '과거 경험 떠올려보기', 
        description: '관련된 과거 경험이 있습니다.', 
        entry_id: experienceData.id 
      }
    }
  } catch (error) {
    console.error('경험 설명 에이전트 API 호출 오류:', error)
    return { 
      strategy: '과거 경험 떠올려보기', 
      description: '관련된 과거 경험이 있습니다.', 
      entry_id: experienceData.id 
    }
  }
}