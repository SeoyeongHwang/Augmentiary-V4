// pages/api/augment.ts

import type { NextApiRequest, NextApiResponse } from 'next';

import { callNarrativeAgent, callInterpretiveAgent } from '../../lib/augmentAgents';

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
    const { diaryEntry, diaryEntryMarked, userProfile } = req.body;

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
