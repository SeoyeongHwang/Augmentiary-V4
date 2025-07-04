// lib/augmentAgents.ts

import { supabase } from './supabase'
import { getCurrentKST } from './time'

// AI 프롬프트를 Supabase에 저장하는 함수
export async function saveAIPrompt(
  entryId: string,
  selectedText: string,
  aiSuggestions: { option1: string; option2: string; option3: string },
  participantCode: string
): Promise<void> {
  try {
    const createdAt = getCurrentKST();
    const { error } = await supabase
      .from('ai_prompts')
      .insert({
        entry_id: entryId,
        selected_text: selectedText,
        ai_suggestion: JSON.stringify(aiSuggestions),
        participant_code: participantCode,
        created_at: createdAt
      })

    if (error) {
      console.error('AI 프롬프트 저장 실패:', error)
    } else {
      console.log('✅ AI 프롬프트 저장 완료')
    }
  } catch (error) {
    console.error('AI 프롬프트 저장 중 오류:', error)
  }
}

export async function callNarrativeAgent(diaryEntry: string): Promise<{ strategy: string; justification: string; raw?: string }> {
    // OpenAI API 호출 예시
    const prompt = `
    You are an expert in narrative identity and meaning-making in personal writing.

Your task is to analyze the following diary entry and output:
1. A natural language description of the dominant narrative processing present.
2. A natural language description of any secondary narrative dynamics present.
3. The emotional tone of the diary entry.
4. The level of narrative coherence (Low / Medium / High).
5. The suggested AI interpretation strategy to support further reflection (choose ONE from the following list, and provide a short justification for your choice):

- Exploratory insight generation
- Positive reframing and redemption
- Action-oriented behavioral guidance
- Connecting with values and life themes
- Acceptance and closure support

Please output the result in the following JSON format:
For each field, write a rich, natural paragraph. Do not truncate the text unnaturally. Express narrative nuances fully.
{
"strategy": "<<<TEXT>>>",
"justification": "<<<TEXT>>>"
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
          { role: 'user', content: `Diary Entry: \n${diaryEntry}` },
        ],
        temperature: 1.0,
      }),
    });
  
    const data = await response.json();
    const textResult = data.choices?.[0]?.message?.content || '';
    
    try {
        const jsonStart = textResult.indexOf('{');
        const jsonEnd = textResult.lastIndexOf('}');
        const jsonString = textResult.substring(jsonStart, jsonEnd + 1);
        const parsedResult = JSON.parse(jsonString);
        return parsedResult;
      } catch (err) {
        console.error('Error parsing Narrative Agent JSON:', err);
        return { strategy: '', justification: '', raw: textResult};
      }
  }
  
export async function callInterpretiveAgent(
    diaryEntryMarked: string,
    userProfile: string,
    narrativeStrategy: string
  ): Promise<{ option1: string; option2: string; option3: string; }> {
    // 마찬가지로 OpenAI API 호출 구현
    // 예시 생략 가능, 위 구조 동일
    const prompt = `
    You are an expert in narrative coaching and personal meaning-making through writing.

You will receive:
- The full diary entry. Inside the diary entry, there will be a <<INSERT HERE>> marker.
- The user's profile (core values, life themes, identity cues)
- The suggested narrative strategy to apply

Your task is to generate THREE interpretive sentences that will be inserted in place of <<INSERT HERE>> in the diary to encourage deeper reflection and meaning-making.

Guidelines:
- Align with the suggested narrative strategy
- Subtly reflect the user's profile and values
- Be phrased as if written by the user (first-person voice) in fluent Korean.
- Avoid generic or clichéd phrasing
- Vary across the three versions (each offering a slightly different lens)
- The sentence should maintain an open stance. Avoid overly prescriptive phrasing such as "I will do X", "I must Y". Instead, favor phrases that open up possibilities (could, might, perhaps, I am starting to see...).
- End the generated text with an open-ended clause that begins with a contextually appropriate (such as 'because ...', 'so that ...', or similar), encouraging the user to reflect and continue writing.
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
          { role: 'user', content: `Diary Entry with <<INSERT HERE>> Marker: \n${diaryEntryMarked}
          \n\n
          User Profile: \n${userProfile}
          \n\n
          Narrative Strategy: \n${narrativeStrategy}
          \n\n
          Please output the result in the following JSON format:
          {
          "option1": "<<<TEXT>>>",
          "option2": "<<<TEXT>>>",
          "option3": "<<<TEXT>>>"
          }
          ` },
        ],
        temperature: 1.0,
      }),
    })

    const data = await response.json();
    const textResult = data.choices?.[0]?.message?.content || '';
    
    try {
        const jsonStart = textResult.indexOf('{');
        const jsonEnd = textResult.lastIndexOf('}');
        
        if (jsonStart === -1 || jsonEnd === -1) {
          console.error('JSON brackets not found in response');
          return { option1: '', option2: '', option3: '' };
        }
        
        let jsonString = textResult.substring(jsonStart, jsonEnd + 1);
        
        // JSON 문자열 정리 (불필요한 공백 제거)
        const cleanedJson = jsonString.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        
        // JSON이 완전하지 않은 경우 수정 시도
        let finalJson = cleanedJson;
        if (!cleanedJson.endsWith('}')) {
          // 마지막 쉼표나 불완전한 문자열 제거 후 닫는 괄호 추가
          finalJson = cleanedJson.replace(/,\s*$/, '') + '}';
        }
        
        // JSON 파싱 시도
        const parsedResult = JSON.parse(finalJson);
        
        // 필수 필드 확인 및 기본값 설정
        return {
          option1: parsedResult.option1 || '',
          option2: parsedResult.option2 || '',
          option3: parsedResult.option3 || ''
        };
        
      } catch (err) {
        console.error('Error parsing Interpretive Agent JSON:', err);
        console.error('Raw response:', textResult);
        
        // JSON 파싱 실패 시 텍스트에서 직접 추출 시도
        try {
          const option1Match = textResult.match(/"option1":\s*"([^"]*)"/);
          const option2Match = textResult.match(/"option2":\s*"([^"]*)"/);
          const option3Match = textResult.match(/"option3":\s*"([^"]*)"/);
          
          return {
            option1: option1Match ? option1Match[1] : '',
            option2: option2Match ? option2Match[1] : '',
            option3: option3Match ? option3Match[1] : ''
          };
        } catch (fallbackErr) {
          console.error('Fallback parsing also failed:', fallbackErr);
          return { option1: '', option2: '', option3: '' };
        }
      }
  }
  
//   export async function callCausalAgent(
//     diaryEntry: string,
//     selectedEntry: string,
//     interpretiveSentence: string
//   ): Promise<string> {
//     // 마찬가지로 OpenAI API 호출 구현
//     // 예시 생략 가능, 위 구조 동일
//     return 'Causal Connective Phrase (stub)';
//   }
  