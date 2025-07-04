// pages/api/augment.ts

import type { NextApiRequest, NextApiResponse } from 'next';

import { callNarrativeAgent, callInterpretiveAgent, saveAIPrompt } from '../../lib/augmentAgents';

// Request ID 생성 함수
const generateRequestId = (): string => {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { diaryEntry, diaryEntryMarked, userProfile, entryId, participantCode, selectedText } = req.body;

    console.log('Received Diary Entry: ', diaryEntry);
    console.log('Received Marked Entry: ', diaryEntryMarked);
    console.log('Received User Profile: ', userProfile);

    // Step 1: Narrative Agent
    const narrativeAgentResult = await callNarrativeAgent(diaryEntry);
    console.log('Narrative Agent Result: ', narrativeAgentResult);

    console.log('Received Narrative Strategy: ', narrativeAgentResult.strategy+'. '+narrativeAgentResult.justification);

    // Step 2: Interpretive Agent
    const interpretiveAgentResult = await callInterpretiveAgent(
      diaryEntryMarked,
      userProfile,
      narrativeAgentResult.strategy+' '+narrativeAgentResult.justification
    );
    
    console.log('Interpretive Agent Result: ', interpretiveAgentResult);

    // AI 응답을 ai_prompts 테이블에 저장
    if (entryId && selectedText && participantCode && interpretiveAgentResult) {
      try {
        await saveAIPrompt(entryId, selectedText, interpretiveAgentResult, participantCode);
        console.log('✅ AI 프롬프트 저장 완료 (API 레벨)');
      } catch (error) {
        console.error('❌ AI 프롬프트 저장 실패 (API 레벨):', error);
      }
    } else {
      console.log('⚠️ AI 프롬프트 저장 조건 불충족:', { 
        hasEntryId: !!entryId, 
        hasSelectedText: !!selectedText, 
        hasParticipantCode: !!participantCode,
        hasInterpretiveResult: !!interpretiveAgentResult 
      });
    }

    // 최종 결과 반환
    res.status(200).json({
      narrativeAgentResult,
      interpretiveAgentResult,
    });

  } catch (error) {
    console.error('Error in augmentation pipeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
