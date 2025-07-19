// lib/augmentAgents.ts

import { supabase } from './supabase'
import { getCurrentKST } from './time'
import { AIAgentResult, AIOption } from '../types/ai'
import { getDirectionAgentApproachesPrompt, getAllApproachNames, getInterpretiveAgentApproachesPrompt, getApproachGuidelines } from './approaches'



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

export async function callDirectionAgent(diaryEntry: string, selectedEntry: string): Promise<{ reflective_summary: string; significance: string; approaches: string[]; raw?: string }> {
    // OpenAI API 호출 예시
    const systemPrompt = `
    You are a reflective writing assistant trained in narrative psychology.

Your task is to analyze the following diary entry and identify its reflective potential. Based on your analysis, recommend the three most suitable meaning-making strategies that could support deeper reflection.

INPUT:
<Selected Diary Entry>: The specific part that the user wants to interpret.
<Previous Context>: Diary entries up to the selected section

Start by interpreting what the selected entry reveals about the person's emotional state, thoughts, or personal concerns. Then assess how much reflective potential this passage holds—i.e., how likely it is to support meaningful self-exploration if meaning-making approaches are applied.

Select THREE approaches from the following list:
${getDirectionAgentApproachesPrompt()}

You must output your response in the following JSON format only:
{
  "reflective_summary": "<Interpretive summary of the selected diary entry>",
  "significance": "1~5",  // Reflective potential: 1 = low (mundane), 5 = high (rich point for meaning-making)
  "approaches": ["<first approach>", "<second approach>", "<third approach>"]
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
          { role: 'user', content: `
          <Selected Diary Entry>: \n${selectedEntry}
          \n\n
          <Previous Context>: \n${diaryEntry}` },
        ],
        temperature: 0.7,
      }),
    });
  
    const data = await response.json();
    const textResult = data.choices?.[0]?.message?.content || '';
    
    console.log('🔍 [DIRECTION AGENT] Raw OpenAI response:', textResult);
    
    try {
        const jsonStart = textResult.indexOf('{');
        const jsonEnd = textResult.lastIndexOf('}');
        const jsonString = textResult.substring(jsonStart, jsonEnd + 1);
        console.log('🔍 [DIRECTION AGENT] Extracted JSON string:', jsonString);
        const parsedResult = JSON.parse(jsonString);
        console.log('🔍 [DIRECTION AGENT] Parsed result:', parsedResult);
        
        // 필수 필드들을 체크하고 기본값 설정
        const safeResult = {
          reflective_summary: parsedResult.reflective_summary || 'Default reflective summary.',
          significance: parsedResult.significance || '3',
          approaches: Array.isArray(parsedResult.approaches) ? parsedResult.approaches : getAllApproachNames().slice(0, 3),
          raw: parsedResult.raw
        };
        
        if (!parsedResult.reflective_summary) {
          console.warn('⚠️ [DIRECTION AGENT] reflective_summary is missing, using default');
        }
        if (!parsedResult.significance) {
          console.warn('⚠️ [DIRECTION AGENT] significance is missing, using default');
        }
        if (!Array.isArray(parsedResult.approaches)) {
          console.warn('⚠️ [DIRECTION AGENT] approaches is missing or not an array, using default');
        }
        
        return safeResult;
      } catch (err) {
        console.error('❌ [DIRECTION AGENT] Error parsing JSON:', err);
        console.error('❌ [DIRECTION AGENT] Raw response was:', textResult);
        return { 
          reflective_summary: 'Error processing response', 
          significance: '3', 
          approaches: getAllApproachNames().slice(0, 3), 
          raw: textResult
        };
      }
  }
  
export async function callInterpretiveAgent(
    diaryEntry: string,
    selectedEntry: string,
    significance: string,
    userProfile: string,
    approaches: string[]
  ): Promise<AIAgentResult> {

    
    const systemPrompt = `
    You are a narrative meaning-making assistant and a personal writing assistant.

Your task is to generate three different short reflective paragraph scaffolds that will be inserted at the end of the selected diary entry. You will use three different meaning-making approaches and selectively incorporate relevant personal resources to personalize and deepen the reflection.

INPUT:
<Selected Diary Entry>: The specific part that the user wants to interpret.
<Previous Context>: Diary entries up to the selected section.
<Significance>: The significance of the selected entry. Shows how much reflective potential this passage holds.
<Approaches>: Three different meaning-making approaches to apply, each for a different option.
<Resource>: The user's profile information in JSON format (demographics, personality, value, past_context, current_context) that can be used for meaning-making.

For each approach, create a distinct perspective and interpretation. Select only relevant resources from these categories that meaningfully support each specific approach: demographics, personality, values, current_context, and future_ideal. Or if there is no reason to use resource, just empty array.

Guidelines:
- Each option should offer a genuinely different perspective and interpretation approach.
- Keep each text to 2-3 sentences with an open stance using possibility phrases (could, might, perhaps, etc.).
- Write in first-person voice with fluent, natural Korean that maintains self-talking tone.
- Avoid directly citing the meaning-making approach or user profile information.
- Avoid generic sentences, clichés, and excessive commas.
- End with a grammatically incomplete sentence that trails off mid-thought, requiring the reader to complete the idea (avoid ending complete thoughts with "...").

**Tone and depth by significance level:**
- Low significance (1-2): Light tone, grounded in everyday observation, avoid heavy emotional language
- Moderate significance (3): Balanced tone—thoughtful but not overly weighty  
- High significance (4-5): Allow for more introspective or emotionally resonant insights

**Title requirements:**
- Reflect specific aspects of the text, different for each option (e.g. "~하기", "~보기")
- In front of the title, include matching thematic emoji (e.g. 🌱💭🔄💫🎯🪞✨🌅📝💪🤝😌🔍)

You must output your response in the following JSON format only:
{
  "option1": {
    "approach": "<First approach name>",
    "resource": [List of referenced resource categories],
    "resource_usage": "<Brief explanation of why you used the resource to support the approach>",
    "title": "<Short and concise title>", 
    "text": "<Paragraph of interpretive text written according to the first meaning-making approach>"
  },
  "option2": {
    "approach": "<Second approach name>",
    "resource": [List of referenced resource categories],
    "resource_usage": "<Brief explanation of why you used the resource to support the approach>",
    "title": "<Short and concise title>", 
    "text": "<Paragraph of interpretive text written according to the second meaning-making approach>"
  },
  "option3": {
    "approach": "<Third approach name>",
    "resource": [List of referenced resource categories],
    "resource_usage": "<Brief explanation of why you used the resource to support the approach>",
    "title": "<Short and concise title>", 
    "text": "<Paragraph of interpretive text written according to the third meaning-making approach>"
  }
}    
  `
    
    const userMessage = `Selected Diary Entry: \n${selectedEntry}
          \n\n
          Previous Context: \n${diaryEntry}
          \n\n
          Significance: \n${significance}
          \n\n
          Approaches: 
          1. ${approaches[0]} - ${getApproachGuidelines(approaches[0]).map(guideline => `${guideline}`).join(', ')}
          2. ${approaches[1]} - ${getApproachGuidelines(approaches[1]).map(guideline => `${guideline}`).join(', ')}
          3. ${approaches[2]} - ${getApproachGuidelines(approaches[2]).map(guideline => `${guideline}`).join(', ')}
          \n\n
          Resource: \n${userProfile}
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
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        top_p: 1.0,
      }),
    })

    const data = await response.json();
    const textResult = data.choices?.[0]?.message?.content || '';
    
    try {
        const jsonStart = textResult.indexOf('{');
        const jsonEnd = textResult.lastIndexOf('}');
        
        if (jsonStart === -1 || jsonEnd === -1) {
          console.error('❌ [INTERPRETIVE AGENT] JSON brackets not found in response');
          return createDefaultAIAgentResult();
        }
        
        let jsonString = textResult.substring(jsonStart, jsonEnd + 1);
        
        // JSON 문자열 정리 및 수정
        let cleanedJson = jsonString.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        
        // 일반적인 JSON 오류 수정
        cleanedJson = cleanedJson
          // 마지막 쉼표 제거 (객체나 배열 끝에서)
          .replace(/,(\s*[}\]])/g, '$1')
          // 쌍따옴표 누락 수정 시도
          .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
          // 홀따옴표를 쌍따옴표로 변경
          .replace(/'/g, '"');
        
        // JSON이 완전하지 않은 경우 수정 시도
        let finalJson = cleanedJson;
        if (!cleanedJson.endsWith('}')) {
          finalJson = cleanedJson.replace(/,\s*$/, '') + '}';
        }
        
        // JSON 파싱 시도
        const parsedResult = JSON.parse(finalJson);
        
        // AIAgentResult 형식으로 변환
        const result: AIAgentResult = {
          option1: createAIOption(parsedResult.option1),
          option2: createAIOption(parsedResult.option2),
          option3: createAIOption(parsedResult.option3)
        };
        
        console.log('✅ [INTERPRETIVE AGENT] Final result with resources:');
        console.log('  Option 1 resources:', result.option1.resource);
        console.log('  Option 2 resources:', result.option2.resource);
        console.log('  Option 3 resources:', result.option3.resource);
        
        return result;
        
      } catch (err) {
        console.error('❌ [INTERPRETIVE AGENT] Error parsing JSON:', err);
        console.error('❌ [INTERPRETIVE AGENT] Attempting fallback parsing...');
        
        // Fallback: 정규표현식으로 개별 필드 추출
        try {
          const fallbackResult = extractFieldsWithRegex(textResult);
          if (fallbackResult) {
            console.log('✅ [INTERPRETIVE AGENT] Fallback parsing successful');
            return fallbackResult;
          }
        } catch (fallbackErr) {
          console.error('❌ [INTERPRETIVE AGENT] Fallback parsing also failed:', fallbackErr);
        }
        
        console.error('❌ [INTERPRETIVE AGENT] Raw response was:', textResult);
        return createDefaultAIAgentResult();
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
- Preserve the original approach, resource, and resource_usage information exactly as provided

Please output the result in the following JSON format:
{
"option1": {
  "approach": "<<<STRATEGY>>>",
  "title": "<<<TITLE>>>",
  "text": "<<<MODIFIED_TEXT_WITH_CONNECTIVE>>>"
},
"option2": {
  "approach": "<<<STRATEGY>>>",
  "title": "<<<TITLE>>>",
  "text": "<<<MODIFIED_TEXT_WITH_CONNECTIVE>>>"
},
"option3": {
  "approach": "<<<STRATEGY>>>",
  "title": "<<<TITLE>>>",
  "text": "<<<MODIFIED_TEXT_WITH_CONNECTIVE>>>"
}
}
  `;

  const userPrompt = `
Please analyze the following interpretive options and add appropriate causal connective phrases:

Option 1:
Strategy: ${aiAgentResult.option1.approach}
Resource: ${JSON.stringify(aiAgentResult.option1.resource)}
Resource Usage: ${aiAgentResult.option1.resource_usage || ''}
Title: ${aiAgentResult.option1.title}
Text: ${aiAgentResult.option1.text}

Option 2:
Strategy: ${aiAgentResult.option2.approach}
Resource: ${JSON.stringify(aiAgentResult.option2.resource)}
Resource Usage: ${aiAgentResult.option2.resource_usage || ''}
Title: ${aiAgentResult.option2.title}
Text: ${aiAgentResult.option2.text}

Option 3:
Strategy: ${aiAgentResult.option3.approach}
Resource: ${JSON.stringify(aiAgentResult.option3.resource)}
Resource Usage: ${aiAgentResult.option3.resource_usage || ''}
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
    approach: option?.approach || '',
    title: option?.title || '',
    text: option?.text || '',
    resource: Array.isArray(option?.resource) ? option.resource : [],
    resource_usage: option?.resource_usage || ''
  };
}

function extractFieldsWithRegex(textResult: string): AIAgentResult | null {
  try {
    // 각 옵션을 개별적으로 추출 (개행 문자 포함)
    const option1Match = textResult.match(/"option1"\s*:\s*{([\s\S]*?)},?\s*"option2"/);
    const option2Match = textResult.match(/"option2"\s*:\s*{([\s\S]*?)},?\s*"option3"/);
    const option3Match = textResult.match(/"option3"\s*:\s*{([\s\S]*?)}\s*}/);
    
    // option3이 마지막인 경우를 위한 추가 매칭
    const option3MatchAlt = textResult.match(/"option3"\s*:\s*{([\s\S]*?)}\s*$/);
    const finalOption3Match = option3Match || option3MatchAlt;
    
    if (!option1Match || !option2Match || !finalOption3Match) {
      console.log('❌ Could not find all three options in regex fallback');
      return null;
    }
    
    const extractOption = (optionText: string): AIOption => {
      const approachMatch = optionText.match(/"approach"\s*:\s*"([^"]*)"/);
      const titleMatch = optionText.match(/"title"\s*:\s*"([^"]*)"/);
      const textMatch = optionText.match(/"text"\s*:\s*"([^"]*)"/);
      const resourceMatch = optionText.match(/"resource"\s*:\s*\[([^\]]*)\]/);
      const resourceUsageMatch = optionText.match(/"resource_usage"\s*:\s*"([^"]*)"/);
      
      // resource 배열 파싱
      let resourceArray: string[] = [];
      if (resourceMatch && resourceMatch[1].trim()) {
        try {
          resourceArray = resourceMatch[1].split(',').map(s => s.trim().replace(/"/g, ''));
        } catch {
          resourceArray = [];
        }
      }
      
      return {
        approach: approachMatch ? approachMatch[1] : '',
        title: titleMatch ? titleMatch[1] : '',
        text: textMatch ? textMatch[1] : '',
        resource: resourceArray,
        resource_usage: resourceUsageMatch ? resourceUsageMatch[1] : ''
      };
    };
    
    return {
      option1: extractOption(option1Match[1]),
      option2: extractOption(option2Match[1]),
      option3: extractOption(finalOption3Match[1])
    };
    
  } catch (err) {
    console.error('❌ Regex extraction failed:', err);
    return null;
  }
}

function parseAIOptionFromMatch(match: RegExpMatchArray | null): AIOption {
  if (!match) return createAIOption({});
  
  const optionText = match[1];
  const approachMatch = optionText.match(/"approach":\s*"([^"]*)"/);
  const titleMatch = optionText.match(/"title":\s*"([^"]*)"/);
  const textMatch = optionText.match(/"text":\s*"([^"]*)"/);
  
  const approachValue = approachMatch ? approachMatch[1] : '';
  
  return {
    approach: approachValue,
    title: titleMatch ? titleMatch[1] : '',
    text: textMatch ? textMatch[1] : '',
    resource: []
  };
}

function createDefaultAIAgentResult(): AIAgentResult {
  const defaultOption: AIOption = {
    approach: '',
    title: '',
    text: '',
    resource: []
  };
  
  return {
    option1: defaultOption,
    option2: defaultOption,
    option3: defaultOption
  };
}

function createDefaultAIOption(): AIOption {
  return {
    approach: '',
    title: '',
    text: '',
    resource: []
  };
}

