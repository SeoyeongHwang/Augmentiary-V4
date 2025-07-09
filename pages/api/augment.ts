// pages/api/augment.ts

import type { NextApiRequest, NextApiResponse } from 'next';

import { callNarrativeAgent, callInterpretiveAgent, callConnectiveAgent, saveAIPrompt } from '../../lib/augmentAgents';
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

    console.log('🚀 [AUGMENT] Starting augmentation pipeline...');

    // Step 1: Narrative Agent
    console.log('📖 [STEP 1] Starting Narrative Agent...');
    const narrativeAgentResult = await callNarrativeAgent(diaryEntry);
    console.log('✅ [STEP 1] Narrative Agent completed:', {
      strategy: narrativeAgentResult.strategy,
      justification: narrativeAgentResult.justification.substring(0, 100) + '...'
    });

    // Step 2: Interpretive Agent
    console.log('💭 [STEP 2] Starting Interpretive Agent...');
    const interpretiveAgentResult: AIAgentResult = await callInterpretiveAgent(
      diaryEntryMarked,
      userProfile,
      narrativeAgentResult.strategy+' '+narrativeAgentResult.justification
    );
    console.log('✅ [STEP 2] Interpretive Agent completed:');
    console.log('  Option 1:', interpretiveAgentResult.option1.title);
    console.log('    Text:', interpretiveAgentResult.option1.text);
    console.log('  Option 2:', interpretiveAgentResult.option2.title);
    console.log('    Text:', interpretiveAgentResult.option2.text);
    console.log('  Option 3:', interpretiveAgentResult.option3.title);
    console.log('    Text:', interpretiveAgentResult.option3.text);

    // Step 3: Connective Agent
    console.log('🔗 [STEP 3] Starting Connective Agent...');
    const connectiveAgentResult: AIAgentResult = await callConnectiveAgent(interpretiveAgentResult);
    console.log('✅ [STEP 3] Connective Agent completed:');
    console.log('  Option 1:', connectiveAgentResult.option1.title);
    console.log('    Text:', connectiveAgentResult.option1.text);
    console.log('    🔄 Change:', interpretiveAgentResult.option1.text !== connectiveAgentResult.option1.text ? 'MODIFIED' : 'UNCHANGED');
    console.log('  Option 2:', connectiveAgentResult.option2.title);
    console.log('    Text:', connectiveAgentResult.option2.text);
    console.log('    🔄 Change:', interpretiveAgentResult.option2.text !== connectiveAgentResult.option2.text ? 'MODIFIED' : 'UNCHANGED');
    console.log('  Option 3:', connectiveAgentResult.option3.title);
    console.log('    Text:', connectiveAgentResult.option3.text);
    console.log('    🔄 Change:', interpretiveAgentResult.option3.text !== connectiveAgentResult.option3.text ? 'MODIFIED' : 'UNCHANGED');

    console.log('🎉 [AUGMENT] Augmentation pipeline completed successfully!');

    // 최종 결과 반환
    res.status(200).json({
      narrativeAgentResult,
      interpretiveAgentResult: connectiveAgentResult,
    });

  } catch (error) {
    console.error('❌ [AUGMENT] Error in augmentation pipeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', 
    },
  },
};
