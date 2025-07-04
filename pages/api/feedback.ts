// pages/api/feedback.ts

import type { NextApiRequest, NextApiResponse } from 'next'
import { saveAIPrompt } from '../../lib/augmentAgents'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '허용되지 않은 메서드' })
  }

  const { selected, before, after, belief, entryId, participantCode } = req.body
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' })
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: `너는 내러티브 기반 의미 구성 도우미야. 사용자의 선택 문장과 앞, 뒤 문맥, 전반적인 신념 요약을 참고하여 "이 사건의 긍정적인 의미 재해석"으로 조심스럽게 이어질 수 있는 마중물 문장을 3가지 제안해. 각 문장은 독립된 단문이어야 하고, 자연스럽게 사용자의 글 안에 삽입될 수 있도록 비슷한 어투를 사용하고 해석의 여지를 남겨. 선택된 내용이 신념과 크게 관련 없을 경우, 경험의 인사이트를 도출하려고 시도해. 맥락에 맞는 내용을 제안하는 것이 가장 중요함을 명심해.

출력 형식:  
1. 첫 번째 문장  
2. 두 번째 문장  
3. 세 번째 문장

사용자의 전반적 가치 요약: ${belief}` 

},
          { role: 'user', content: `앞 문맥: ${before}\n선택 문장: ${selected}\n뒷 문맥: ${after}` },
        ],
        temperature: 0.8,
      }),
    })

    const result = await response.json()

    if (!result.choices || result.choices.length < 1) {
      return res.status(500).json({ error: 'GPT 응답 없음', raw: result })
    }

    const raw = result.choices[0].message?.content || ''
    const lines = raw.split(/\n?\d+\.\s+/).map((line: string) => line.trim()).filter(Boolean)

    if (lines.length < 1) {
      return res.status(500).json({ error: '3가지 문장을 분리할 수 없습니다.', raw })
    }

    // AI 응답을 ai_prompts 테이블에 저장 (비동기로 처리)
    if (entryId && selected && participantCode) {
      // 저장을 비동기로 처리하여 응답 지연 방지
      Promise.all(
        lines
          .filter((suggestion: string) => suggestion && suggestion.trim())
          .map((suggestion: string) => 
            saveAIPrompt(entryId, selected, suggestion, participantCode)
          )
      ).catch(error => {
        console.error('AI 프롬프트 저장 중 오류:', error)
      })
    }

    res.status(200).json({ options: lines })
  } catch (err) {
    console.error('OpenAI 호출 실패:', err)
    res.status(500).json({ error: 'OpenAI 호출 중 오류 발생' })
  }
}