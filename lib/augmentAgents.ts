// lib/augmentAgents.ts

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

Your task is to generate THREE interpretive sentence that will be inserted in place of <<INSERT HERE>> in the diary to encourage deeper reflection and meaning-making.

Guidelines:
- Align with the suggested narrative strategy
- Subtly reflect the user's profile and values
- Be phrased as if written by the user (first person voice) in fluent Korean.
- Avoid generic or clichéd phrasing
- Vary across the three versions (each offering a slightly different lens)
- The sentence should maintain an open stance. Avoid overly prescriptive phrasing such as "I will do X", "I must Y". Instead, favor phrases that open up possibilities (could, might, perhaps, I am starting to see...).
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
        const jsonString = textResult.substring(jsonStart, jsonEnd + 1);
        const parsedResult = JSON.parse(jsonString);
        return parsedResult;
      } catch (err) {
        console.error('Error parsing Interpretive Agent JSON:', err);
        return { option1: '', option2: '', option3: ''};
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
  