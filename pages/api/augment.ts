// pages/api/augment.ts

import type { NextApiRequest, NextApiResponse } from 'next';

import { callNarrativeAgent, callInterpretiveAgent, saveAIPrompt } from '../../lib/augmentAgents';
import { AIAgentResult } from '../../types/ai';

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

    // Step 1: Narrative Agent
    const narrativeAgentResult = await callNarrativeAgent(diaryEntry);

    // Step 2: Interpretive Agent
    const interpretiveAgentResult: AIAgentResult = await callInterpretiveAgent(
      diaryEntryMarked,
      userProfile,
      narrativeAgentResult.strategy+' '+narrativeAgentResult.justification
    );

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

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // 4메가바이트까지 허용
    },
  },
}
