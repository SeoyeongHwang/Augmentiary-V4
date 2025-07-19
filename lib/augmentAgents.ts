// lib/augmentAgents.ts

import { supabase } from './supabase'
import { getCurrentKST } from './time'
import { AIAgentResult, AIOption } from '../types/ai'



// AI 프롬프트를 Supabase에 저장하는 함수
export async function saveAIPrompt(
  entryId: string,
  selectedText: string,
  aiSuggestions: AIAgentResult,
  participantCode: string
): Promise<void> {
  try {
    const createdAt = getCurrentKST();
  
    
    const { error } = await supabase
      .from('ai_prompts')
      .insert({
        entry_id: entryId,
        selected_text: selectedText,
        ai_suggestion: (() => {
          // 이미 문자열인 경우 파싱 후 다시 문자열로 변환 (이중 인코딩 방지)
          if (typeof aiSuggestions === 'string') {
            try {
              const parsed = JSON.parse(aiSuggestions)
              return JSON.stringify(parsed)
            } catch {
              return aiSuggestions
            }
          }
          // 객체인 경우 문자열로 변환
          return JSON.stringify(aiSuggestions)
        })(),
        participant_code: participantCode,
        created_at: createdAt
      })

    if (error) {
      console.error('AI 프롬프트 저장 실패:', error)
    } else {

    }
  } catch (error) {
    console.error('AI 프롬프트 저장 중 오류:', error)
  }
}

export async function callNarrativeAgent(diaryEntry: string, selectedEntry: string): Promise<{ strategy: string; justification: string; raw?: string }> {
    // OpenAI API 호출 예시
    const systemPrompt = `
    You are an expert in narrative identity and meaning-making in personal writing.

Your task is to analyze the following diary entry and determine the best AI interpretation strategy to support further reflection.

Choose ONE strategy from the following list:
- Exploratory insight generation
- Positive reframing and redemption
- Action-oriented behavioral guidance
- Connecting with values and life themes
- Acceptance and closure support

You must output your response in the following JSON format only:
{
"strategy": "The chosen strategy name exactly as listed above",
"justification": "A rich, natural paragraph explaining why this strategy is most appropriate for this diary entry. Consider the emotional tone, narrative coherence, and dominant themes present in the writing."
}

Do not include any text before or after the JSON. Return only valid JSON.
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
          { role: 'user', content: `Diary Entry: \n${diaryEntry}
          \n\n
          Selected Entry: \n${selectedEntry}` },
        ],
        temperature: 1.0,
      }),
    });
  
    const data = await response.json();
    const textResult = data.choices?.[0]?.message?.content || '';
    
    console.log('🔍 [NARRATIVE AGENT] Raw OpenAI response:', textResult);
    
    try {
        const jsonStart = textResult.indexOf('{');
        const jsonEnd = textResult.lastIndexOf('}');
        const jsonString = textResult.substring(jsonStart, jsonEnd + 1);
        console.log('🔍 [NARRATIVE AGENT] Extracted JSON string:', jsonString);
        const parsedResult = JSON.parse(jsonString);
        console.log('🔍 [NARRATIVE AGENT] Parsed result:', parsedResult);
        
        // 필수 필드들을 체크하고 기본값 설정
        const safeResult = {
          strategy: parsedResult.strategy || 'Exploratory insight generation',
          justification: parsedResult.justification || 'Default justification for narrative analysis.',
          raw: parsedResult.raw
        };
        
        if (!parsedResult.strategy) {
          console.warn('⚠️ [NARRATIVE AGENT] strategy is missing, using default');
        }
        if (!parsedResult.justification) {
          console.warn('⚠️ [NARRATIVE AGENT] justification is missing, using default');
        }
        
        return safeResult;
      } catch (err) {
        console.error('❌ [NARRATIVE AGENT] Error parsing JSON:', err);
        console.error('❌ [NARRATIVE AGENT] Raw response was:', textResult);
        return { strategy: '', justification: '', raw: textResult};
      }
  }
  
export async function callInterpretiveAgent(
    diaryEntryMarked: string,
    userProfile: string,
    narrativeStrategy: string
  ): Promise<AIAgentResult> {
    // 마찬가지로 OpenAI API 호출 구현
    // 예시 생략 가능, 위 구조 동일
    const systemPrompt = `
    You are an expert in narrative coaching and personal meaning-making through writing.

You will receive:
- The full diary entry. Inside the diary entry, there will be a <<INSERT HERE>> marker.
- The user's profile (core values, life themes, identity cues)
- The suggested narrative strategy to apply

Your task is to generate THREE interpretive options that will be inserted in place of <<INSERT HERE>> in the diary to encourage deeper reflection and meaning-making.

For each option, provide:
1. strategy: meaning-making strategy being used in this option (lesson learning / gaining insight / positive reappraisal)
2. title: A short, engaging title for this interpretive approach. Put relative emoji in front of the title.
3. text: The actual interpretive sentence to be inserted

You can meaning-make based on following meaning-making strategies:
- lesson learning: Practical reasoning derived from experience, guiding future actions in similar situations.
- gaining insight: Taking a step back from experience and connecting the message gained from that experience with a deeper understanding of oneself or knowledge of the world and relationships.
- positive reappraisal: Re-framing a situation in a more positive or hopeful light, based on one's beliefs and values.

Guidelines:
- Align with the suggested narrative strategy.
- You can subtly reflect the user's profile and values but avoid directly citing phrases in profile data.
- Avoid directly citing meaning-making strategies in the text.
- Avoid generic or clichéd phrasing.
- Avoid using excessive commas in the text.
- Be phrased as if written by the user (first-person voice) in fluent Korean.
- Vary across the three versions (each offering different perspectives)
- The text should have an open stance. Avoid overly prescriptive phrasing such as "I will do X", "I must Y". Instead, favor phrases that open up possibilities (could, might, perhaps, etc.).
- End the generated text with an open-ended clause or question that can encourage the user to reflect and continue writing.
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
          { role: 'user', content: `Diary Entry with <<INSERT HERE>> Marker: \n${diaryEntryMarked}
          \n\n
          User Profile: \n${userProfile}
          \n\n
          Narrative Strategy: \n${narrativeStrategy}
          \n\n
          Please output the result in the following JSON format:
          {
          "option1": {
            "strategy": "<<<STRATEGY>>>",
            "title": "<<<TITLE>>>",
            "text": "<<<TEXT>>>"
          },
          "option2": {
            "strategy": "<<<STRATEGY>>>",
            "title": "<<<TITLE>>>",
            "text": "<<<TEXT>>>"
          },
          "option3": {
            "strategy": "<<<STRATEGY>>>",
            "title": "<<<TITLE>>>",
            "text": "<<<TEXT>>>"
          }
          }
          ` },
        ],
        temperature: 0.4,
        top_p: 0.9,
      }),
    })

    const data = await response.json();
    const textResult = data.choices?.[0]?.message?.content || '';
    
    try {
        const jsonStart = textResult.indexOf('{');
        const jsonEnd = textResult.lastIndexOf('}');
        
        if (jsonStart === -1 || jsonEnd === -1) {
          console.error('JSON brackets not found in response');
          return createDefaultAIAgentResult();
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
          option1: createAIOption(parsedResult.option1),
          option2: createAIOption(parsedResult.option2),
          option3: createAIOption(parsedResult.option3)
        };
        
      } catch (err) {
        console.error('Error parsing Interpretive Agent JSON:', err);
        console.error('Raw response:', textResult);
        
        // JSON 파싱 실패 시 텍스트에서 직접 추출 시도
        try {
          const option1Match = textResult.match(/"option1":\s*\{([^}]*)\}/);
          const option2Match = textResult.match(/"option2":\s*\{([^}]*)\}/);
          const option3Match = textResult.match(/"option3":\s*\{([^}]*)\}/);
          
          return {
            option1: parseAIOptionFromMatch(option1Match),
            option2: parseAIOptionFromMatch(option2Match),
            option3: parseAIOptionFromMatch(option3Match)
          };
        } catch (fallbackErr) {
          console.error('Fallback parsing also failed:', fallbackErr);
          return createDefaultAIAgentResult();
        }
      }
  }

export async function callConnectiveAgent(
  aiAgentResult: AIAgentResult
): Promise<AIAgentResult> {
  const systemPrompt = `
  You are an expert in narrative coaching and writing flow enhancement.

For each text segment, add a natural and contextually appropriate causal expression at the end.
Refer to the following conjunctions:
- "왜냐하면..." (because...)
- "그렇게 하려면..." (to do that...)
- "그래서..." (so...)
- "그러면..." (then...)
- "그렇다면..." (if so...)
- "그런데..." (but...)
- "그리고..." (and...)
- "그럼에도..." (nevertheless...)
- "그것은..." (that is...)
- "그래야..." (should...)
- "어떻게 하면..." (how to...)

Guidelines:
- Choose Korean conjunctions that naturally flow from the last sentence of the text
- Keep the original text intact, only add the connective phrase at the end of the text

Please output the result in the following JSON format:
{
"option1": {
  "strategy": "<<<STRATEGY>>>",
  "title": "<<<TITLE>>>",
  "text": "<<<MODIFIED_TEXT_WITH_CONNECTIVE>>>"
},
"option2": {
  "strategy": "<<<STRATEGY>>>",
  "title": "<<<TITLE>>>",
  "text": "<<<MODIFIED_TEXT_WITH_CONNECTIVE>>>"
},
"option3": {
  "strategy": "<<<STRATEGY>>>",
  "title": "<<<TITLE>>>",
  "text": "<<<MODIFIED_TEXT_WITH_CONNECTIVE>>>"
}
}
  `;

  const userPrompt = `
Please analyze the following interpretive options and add appropriate causal connective phrases:

Option 1:
Strategy: ${aiAgentResult.option1.strategy}
Title: ${aiAgentResult.option1.title}
Text: ${aiAgentResult.option1.text}

Option 2:
Strategy: ${aiAgentResult.option2.strategy}
Title: ${aiAgentResult.option2.title}
Text: ${aiAgentResult.option2.text}

Option 3:
Strategy: ${aiAgentResult.option3.strategy}
Title: ${aiAgentResult.option3.title}
Text: ${aiAgentResult.option3.text}
  `;

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
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
    }),
  });

  const data = await response.json();
  const textResult = data.choices?.[0]?.message?.content || '';
  
  try {
    const jsonStart = textResult.indexOf('{');
    const jsonEnd = textResult.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('JSON brackets not found in ConnectiveAgent response');
      return aiAgentResult; // 원본 결과 반환
    }
    
    let jsonString = textResult.substring(jsonStart, jsonEnd + 1);
    
    // JSON 문자열 정리
    const cleanedJson = jsonString.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    // JSON이 완전하지 않은 경우 수정 시도
    let finalJson = cleanedJson;
    if (!cleanedJson.endsWith('}')) {
      finalJson = cleanedJson.replace(/,\s*$/, '') + '}';
    }
    
    // JSON 파싱 시도
    const parsedResult = JSON.parse(finalJson);
    
    // 필수 필드 확인 및 기본값 설정
    return {
      option1: createAIOption(parsedResult.option1),
      option2: createAIOption(parsedResult.option2),
      option3: createAIOption(parsedResult.option3)
    };
    
  } catch (err) {
    console.error('Error parsing ConnectiveAgent JSON:', err);
    console.error('Raw response:', textResult);
    
    // JSON 파싱 실패 시 원본 결과 반환
    return aiAgentResult;
  }
}

// 헬퍼 함수들
function createAIOption(option: any): AIOption {
  return {
    strategy: option?.strategy || '',
    title: option?.title || '',
    text: option?.text || ''
  };
}

function parseAIOptionFromMatch(match: RegExpMatchArray | null): AIOption {
  if (!match) return createAIOption({});
  
  const optionText = match[1];
  const strategyMatch = optionText.match(/"strategy":\s*"([^"]*)"/);
  const titleMatch = optionText.match(/"title":\s*"([^"]*)"/);
  const textMatch = optionText.match(/"text":\s*"([^"]*)"/);
  
  return {
    strategy: strategyMatch ? strategyMatch[1] : '',
    title: titleMatch ? titleMatch[1] : '',
    text: textMatch ? textMatch[1] : ''
  };
}

function createDefaultAIAgentResult(): AIAgentResult {
  const defaultOption: AIOption = {
    strategy: '',
    title: '',
    text: ''
  };
  
  return {
    option1: defaultOption,
    option2: defaultOption,
    option3: defaultOption
  };
}

