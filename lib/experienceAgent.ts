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

// 새로운 인터페이스: 두 필드를 모두 분석한 결과
export interface ExperienceAnalysisResultCombined {
  innerstateSimilarity: number
  insightSimilarity: number
  averageSimilarity: number
  innerstateReason: string
  insightReason: string
  analysisReasons: string[]
}

// 경험 분석 에이전트 - 선택된 텍스트와 이전 일기의 두 필드를 한 번에 분석
export async function callPastRecordAgent(
  selectedText: string,
  sumInnerstate?: string,
  sumInsight?: string
): Promise<ExperienceAnalysisResultCombined> {
  try {
    const systemPrompt = `
    You are an reflective journaling coach and helping people connect their current experiences with meaningful past experiences.
    
    INPUT:
    1. A selected text from a current diary entry
    2. Two summaries from a previous diary entry:
       - Inner emotional state summary
       - Insights/realizations summary
    
    Your task is to analyze how similar or related the selected text is to BOTH summaries in terms of:
    - Emotional themes and feelings
    - Life experiences and situations
    - Personal growth and insights
    - Underlying psychological patterns
    
    Selected text from current entry: "${selectedText}"
    
    Previous entry's inner emotional state: "${sumInnerstate || 'N/A'}"
    Previous entry's insights/realizations: "${sumInsight || 'N/A'}"
    
    **Similarity Scores:**
    - 0.0-0.2: Completely different topics or emotions
    - 0.3-0.5: Some similarities, but different contexts
    - 0.6-0.8: Similar emotions or situations, related
    - 0.9-1.0: Very similar or strong relatedness
    
    **Guidelines:**
    - If a summary is "N/A", set its similarity to 0 and reason to "No relevant information provided."

    ## Output Format
    Return your output as a JSON object structured exactly as follows:
    {
      "innerstateSimilarity": <number between 0 and 1>,
      "insightSimilarity": <number between 0 and 1>,
      "innerstateReason": "<brief explanation in Korean of why inner state is similar or different>",
      "insightReason": "<brief explanation in Korean of why insights are similar or different>"
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
          { role: 'system', content: systemPrompt },
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
        return {
          innerstateSimilarity: 0,
          insightSimilarity: 0,
          averageSimilarity: 0,
          innerstateReason: 'JSON 형식 오류',
          insightReason: 'JSON 형식 오류',
          analysisReasons: ['JSON 형식 오류']
        }
      }
      
      const jsonString = textResult.substring(jsonStart, jsonEnd + 1)
      const parsedResult = JSON.parse(jsonString)
      
      const innerstateSimilarity = Math.min(1, Math.max(0, parseFloat(parsedResult.innerstateSimilarity) || 0))
      const insightSimilarity = Math.min(1, Math.max(0, parseFloat(parsedResult.insightSimilarity) || 0))
      
      // 평균 유사도 계산 (유효한 필드만 고려)
      let validFields = 0
      let totalSimilarity = 0
      
      if (sumInnerstate) {
        totalSimilarity += innerstateSimilarity
        validFields++
      }
      
      if (sumInsight) {
        totalSimilarity += insightSimilarity
        validFields++
      }
      
      const averageSimilarity = validFields > 0 ? totalSimilarity / validFields : 0
      
      // 분석 이유 배열 생성
      const analysisReasons: string[] = []
      if (sumInnerstate && parsedResult.innerstateReason) {
        analysisReasons.push(`내면상태: ${parsedResult.innerstateReason}`)
      }
      if (sumInsight && parsedResult.insightReason) {
        analysisReasons.push(`깨달음: ${parsedResult.insightReason}`)
      }
      
      return {
        innerstateSimilarity,
        insightSimilarity,
        averageSimilarity,
        innerstateReason: parsedResult.innerstateReason || '분석 결과 없음',
        insightReason: parsedResult.insightReason || '분석 결과 없음',
        analysisReasons
      }
    } catch (err) {
      console.error('경험 에이전트 JSON 파싱 오류:', err)
      console.error('원본 응답:', textResult)
      return {
        innerstateSimilarity: 0,
        insightSimilarity: 0,
        averageSimilarity: 0,
        innerstateReason: 'JSON 파싱 실패',
        insightReason: 'JSON 파싱 실패',
        analysisReasons: ['JSON 파싱 실패']
      }
    }
  } catch (error) {
    console.error('경험 에이전트 API 호출 오류:', error)
    return {
      innerstateSimilarity: 0,
      insightSimilarity: 0,
      averageSimilarity: 0,
      innerstateReason: '분석 오류',
      insightReason: '분석 오류',
      analysisReasons: ['분석 오류']
    }
  }
}

// 경험 설명 에이전트 - 선택된 텍스트와 관련된 경험에 대한 상세 설명 및 접근 생성
export async function callAutobiographicReasoningAgent(
  selectedText: string,
  experienceData: {
    id: string
    sum_innerstate?: string
    sum_insight?: string
    content?: string
  }
): Promise<ExperienceDescriptionResult> {
  try {
    const systemPrompt = `
    You are an reflective journaling coach and helping people connect their current experiences with meaningful past experiences.
    
    INPUT:
    1. A selected text from a current diary entry
    2. Data from a related past diary entry (inner state summary, insights, or content)
    
    TASK:
    Create a recalling strategy title that suggests how to recall and relate this past experience to the current text. Write a brief description of why this past experience is relevant to the current text. Be phrased as if written by the user (first-person voice) in fluent Korean.
    
    Current selected text: "${selectedText}"
    
    Past experience data:
    ${experienceData.sum_innerstate ? `- Inner state: ${experienceData.sum_innerstate}` : ''}
    ${experienceData.sum_insight ? `- Insights: ${experienceData.sum_insight}` : ''}
    ${experienceData.content ? `- Content preview: ${experienceData.content.substring(0, 200)}...` : ''}
     
    **Guidelines:**
    - Strategy should start with an appropriate emoji that represents the type of reflection
    - Choose emojis that match the thematic context (💭💡🌱🔄💫🎯🪞✨🌅📝💪🤝😌🔍)
    - Strategy should be actionable and specific to the type of connection
    - Description should explain the emotional or situational connection but as a ambiguous hint, not a direct quote.
    - Keep both concise but meaningful
    - Use warm, encouraging informal self-suggesting style
    - The text should have an open stance. Avoid overly prescriptive or definitive phrasing. Instead, favor phrases that open up possibilities (could, might, perhaps, ...)
    - Make sure the last sentence is unfinished.

    ## Output Format
    Your output must be a JSON object structured as follows:
     {
       "strategy": "<Korean title with appropriate emoji suggesting how to recall this experience (e.g., '💭 ~해보기', '🌱 ~돌아보기', '🔄 ~인식하기')>",
       "description": "<Korean description of why this past experience is relevant to current text, 2-3 sentences max>",
       "entry_id": "${experienceData.id}"
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
          { role: 'system', content: systemPrompt },
        ],
        temperature: 0.7,
        top_p: 1.0
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

// 과거 생애 맥락 기반 경험 카드 생성 에이전트
export async function callPastContextAgent(
  selectedText: string,
  pastContext: string
): Promise<ExperienceDescriptionResult> {
  try {
    const systemPrompt = `
    You are a reflective journaling coach helping people connect their current experiences with meaningful past experiences.
    
    INPUT:
    1. A selected text from a current diary entry
    2. The user's personal life context from their past (background, experiences, personality traits)
    
    TASK:
    1. Create a recalling strategy title that suggests how to connect the current text with the user's past experiences or background
    2. Write a brief description of why this past context is relevant to the current text. Phrase this as if written by the user (first-person voice) in fluent Korean.
    
    Current selected text: "${selectedText}"
    
    User's past context: "${pastContext}"
    
    **Guidelines:**
    - Strategy should be SPECIFIC and CONCRETE based on the actual past context provided
    - DO NOT use generic templates like "~연결하기", "~돌아보기" without context
    - Instead, create titles that reference specific aspects of the user's past (e.g., "🌱 어린 시절의 독립성 떠올려보기", "💭 학창시절의 성취감 기억하기", "🔄 과거의 성향과 현재 연결하기")
    - Choose emojis that match the thematic context (🌱💭🔄💫🎯🪞✨🌅📝💪🤝😌🔍)
    - Description should explain how the user's specific past experiences or personality traits relate to the current situation
    - Keep both concise but meaningful
    - Use warm, encouraging informal self-suggesting style
    - The text should have an open stance. Avoid overly prescriptive or definitive phrasing. Instead, favor phrases that open up possibilities (could, might, perhaps, ...)
    - Focus on how the user's background, personality, or past experiences might influence their current thoughts or feelings
    - IMPORTANT: Make the strategy title specific to the content of the past context, not generic
    - Make sure the last sentence is unfinished.
       
    ## Output Format
    Return your output as a JSON object structured exactly as follows:
    {
      "strategy": "<Korean title with appropriate emoji suggesting how to connect with past background>",
      "description": "<Korean description of why this past context is relevant to current text, 2-3 sentences max>",
      "entry_id": "past_context"
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
          { role: 'system', content: systemPrompt },
        ],
        temperature: 0.7,
        top_p: 1.0
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
        console.error('과거 맥락 에이전트 JSON 브래킷을 찾을 수 없음')
        return { 
          strategy: '과거 배경 떠올려보기', 
          description: '내 과거 경험이 지금과 연결되어 있을 수 있어요.', 
          entry_id: 'past_context' 
        }
      }
      
      const jsonString = textResult.substring(jsonStart, jsonEnd + 1)
      const parsedResult = JSON.parse(jsonString)
      
      const descriptionResult = {
        strategy: parsedResult.strategy || '과거 배경 떠올려보기',
        description: parsedResult.description || '내 과거 경험이 지금과 연결되어 있을 수 있어요.',
        entry_id: 'past_context'
      }
      
      return descriptionResult
    } catch (err) {
      console.error('과거 맥락 에이전트 JSON 파싱 오류:', err)
      console.error('원본 응답:', textResult)
      return { 
        strategy: '과거 배경 떠올려보기', 
        description: '내 과거 경험이 지금과 연결되어 있을 수 있어요.', 
        entry_id: 'past_context' 
      }
    }
  } catch (error) {
    console.error('과거 맥락 에이전트 API 호출 오류:', error)
    return { 
      strategy: '과거 배경 떠올려보기', 
      description: '내 과거 경험이 지금과 연결되어 있을 수 있어요.', 
      entry_id: 'past_context' 
    }
  }
}

// 과거 맥락 연관성 분석 에이전트
export async function callPastContextRelevanceAgent(
  selectedText: string,
  pastContext: string
): Promise<{ relevance: number; reason: string }> {
  try {
    const systemPrompt = `
    You are an reflective journaling coach and helping people connect their current experiences with meaningful past experiences.
    
    INPUT:
    1. A selected text from a current diary entry
    2. The user's personal life context from their past (background, experiences, personality traits)
    
    TASK:
    Analyze how similar or related these two pieces of text are in terms of:
    - Emotional themes and feelings
    - Life experiences and situations
    - Personal growth and insights
    - Underlying psychological patterns
    - Personality traits and behavioral patterns
    
    Selected text from current entry: "${selectedText}"
    
    User's past context: "${pastContext}"
    
    **Output Format:**
    Your output must be a JSON object structured as follows:
    {
      "relevance": <number between 0 and 1>,
      "reason": "<brief explanation in Korean of why they are related or not>"
    }
    
    **Similarity Scores:**
    - 0.0-0.2: Completely different topics or contexts
    - 0.3-0.5: Some similarities, but different contexts
    - 0.6-0.8: Similar emotions, situations, traits, or relatedness
    - 0.9-1.0: Very similar or strong relatedness
    
    Focus on how the user's past experiences, personality traits, or background might relate to their current thoughts, feelings, or situation.
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
          { role: 'system', content: systemPrompt },
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
        console.error('과거 맥락 연관성 에이전트 JSON 브래킷을 찾을 수 없음')
        return { relevance: 0, reason: 'JSON 형식 오류' }
      }
      
      const jsonString = textResult.substring(jsonStart, jsonEnd + 1)
      const parsedResult = JSON.parse(jsonString)
      
      const analysisResult = {
        relevance: Math.min(1, Math.max(0, parseFloat(parsedResult.relevance) || 0)),
        reason: parsedResult.reason || '분석 결과 없음'
      }
      
      return analysisResult
    } catch (err) {
      console.error('과거 맥락 연관성 에이전트 JSON 파싱 오류:', err)
      console.error('원본 응답:', textResult)
      return { relevance: 0, reason: 'JSON 파싱 실패' }
    }
  } catch (error) {
    console.error('과거 맥락 연관성 에이전트 API 호출 오류:', error)
    return { relevance: 0, reason: '분석 오류' }
  }
}