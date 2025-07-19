// pages/api/augment.ts

import type { NextApiRequest, NextApiResponse } from 'next';

import { callDirectionAgent, callInterpretiveAgent, saveAIPrompt } from '../../lib/augmentAgents';
import { AIAgentResult } from '../../types/ai';

// Request ID 생성 함수
const generateRequestId = (): string => {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// userProfile JSON을 필요한 필드들만 추출하여 변환하는 함수
const extractUserProfileForResource = (userProfileInput: any) => {
  try {
    console.log('🔍 [EXTRACT] Input analysis:', {
      type: typeof userProfileInput,
      isNull: userProfileInput === null,
      isUndefined: userProfileInput === undefined,
      isEmpty: userProfileInput === '',
      fullInput: userProfileInput
    });
    
    // null/undefined 처리
    if (!userProfileInput) {
      console.log('❌ [EXTRACT] Empty user profile, using default structure');
      return JSON.stringify({
        demographics: {},
        personality: {},
        values: {},
        current_context: {},
        future_ideal: {}
      }, null, 2);
    }

    // 이미 객체인 경우
    let fullProfile;
    if (typeof userProfileInput === 'object') {
      console.log('📊 [EXTRACT] User profile is already an object:', userProfileInput);
      fullProfile = userProfileInput;
    } else if (typeof userProfileInput === 'string') {
      // 문자열인 경우 trim 체크
      if (userProfileInput.trim() === '') {
        console.log('Empty user profile string, using default structure');
        return JSON.stringify({
          demographics: {},
          personality: {},
          values: {},
          current_context: {},
          future_ideal: {}
        }, null, 2);
      }
      
      // JSON 파싱 시도
      try {
        fullProfile = JSON.parse(userProfileInput);
      } catch (parseError) {
        // JSON 파싱 실패 시 문자열을 current_context로 사용
        console.log('User profile is not JSON, treating as plain text');
        fullProfile = {
          current_context: { description: userProfileInput }
        };
      }
    } else {
      console.log('Unexpected user profile type:', typeof userProfileInput);
      return JSON.stringify({
        demographics: {},
        personality: {},
        values: {},
        current_context: {},
        future_ideal: {}
      }, null, 2);
    }
    
    // 실제 프로필 구조에 맞춰 InterpretiveAgent에서 사용할 필드들 추출
    const resourceProfile = {
      demographics: fullProfile.social_identity || fullProfile.demographics || {},
      personality: fullProfile.personal_identity?.personality 
        ? { description: fullProfile.personal_identity.personality }
        : fullProfile.personality || {},
      values: fullProfile.personal_identity?.value 
        ? { description: fullProfile.personal_identity.value }
        : fullProfile.values || {},
      current_context: fullProfile.personal_life_context?.present 
        ? { description: fullProfile.personal_life_context.present }
        : fullProfile.current_context || {},
      future_ideal: fullProfile.personal_life_context?.future 
        ? { description: fullProfile.personal_life_context.future }
        : fullProfile.future_ideal || {}
    };
    
    console.log('📊 [EXTRACT] Mapped resource profile:', resourceProfile);
    
    return JSON.stringify(resourceProfile, null, 2);
  } catch (error) {
    console.error('Error processing user profile:', error);
    // 모든 처리 실패 시 기본 구조 반환
    return JSON.stringify({
      demographics: {},
      personality: {},
      values: {},
      current_context: {},
      future_ideal: {}
    }, null, 2);
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { diaryEntry, diaryEntryMarked, userProfile, entryId, participantCode, selectedText } = req.body;

    console.log('🚀 [AUGMENT] Starting augmentation pipeline...');

    // Step 1: Direction Agent
    console.log('📖 [STEP 1] Starting Direction Agent...');
    const directionAgentResult = await callDirectionAgent(diaryEntry, selectedText);
    console.log('✅ [STEP 1] Direction Agent completed:', {
      reflective_summary: directionAgentResult.reflective_summary ? directionAgentResult.reflective_summary.substring(0, 100) + '...' : 'No summary',
      significance: directionAgentResult.significance,
      approaches: directionAgentResult.approaches
    });

    // userProfile을 resource 형태로 변환
    console.log('📊 [AUGMENT] Original userProfile received:', {
      type: typeof userProfile,
      isNull: userProfile === null,
      isUndefined: userProfile === undefined,
      isEmpty: userProfile === '',
      fullContent: userProfile,
      stringLength: typeof userProfile === 'string' ? userProfile.length : 'N/A'
    });
    
    const resourceProfile = extractUserProfileForResource(userProfile);
    
    console.log('📊 [AUGMENT] Processed resourceProfile:', {
      type: typeof resourceProfile,
      length: resourceProfile ? resourceProfile.length : 0,
      content: resourceProfile ? resourceProfile.substring(0, 200) + '...' : 'No content'
    });

    // Step 2: Interpretive Agent (모든 approach를 한번에 처리)
    console.log('💭 [STEP 2] Starting Interpretive Agent with all approaches...');
    console.log(`💭 [STEP 2] Processing ${directionAgentResult.approaches.length} approaches:`, directionAgentResult.approaches);
    
    const interpretiveAgentResult = await callInterpretiveAgent(
      diaryEntry,
      selectedText,
      directionAgentResult.significance,
      resourceProfile,
      directionAgentResult.approaches
    );

    console.log('✅ [STEP 2] All Interpretive Agents completed:');
    console.log('  Option 1:', {
      title: interpretiveAgentResult.option1.title,
      approach: interpretiveAgentResult.option1.approach,
      resources: interpretiveAgentResult.option1.resource,
      resource_usage: interpretiveAgentResult.option1.resource_usage,
      text: interpretiveAgentResult.option1.text ? interpretiveAgentResult.option1.text.substring(0, 50) + '...' : 'No text'
    });
    console.log('  Option 2:', {
      title: interpretiveAgentResult.option2.title,
      approach: interpretiveAgentResult.option2.approach,
      resources: interpretiveAgentResult.option2.resource,
      resource_usage: interpretiveAgentResult.option2.resource_usage,
      text: interpretiveAgentResult.option2.text ? interpretiveAgentResult.option2.text.substring(0, 50) + '...' : 'No text'
    });
    console.log('  Option 3:', {
      title: interpretiveAgentResult.option3.title,
      approach: interpretiveAgentResult.option3.approach,
      resources: interpretiveAgentResult.option3.resource,
      resource_usage: interpretiveAgentResult.option3.resource_usage,
      text: interpretiveAgentResult.option3.text ? interpretiveAgentResult.option3.text.substring(0, 50) + '...' : 'No text'
    });

    console.log('🎉 [AUGMENT] Augmentation pipeline completed successfully!');

    // 최종 결과 반환
    res.status(200).json({
      directionAgentResult,
      interpretiveAgentResult: interpretiveAgentResult,
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
