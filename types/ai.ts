export interface AIPrompt {
  id: string
  entry_id: string
  selected_text: string
  ai_suggestion: string
  user_edit?: string
  created_at: string
}

export interface CreateAIPromptData {
  entry_id: string
  selected_text: string
  ai_suggestion: string
  user_edit?: string
}

// 새로운 AI 옵션 타입
export interface AIOption {
  strategy: string
  title: string
  text: string
}

export interface AIAgentResult {
  option1: AIOption
  option2: AIOption
  option3: AIOption
}

// AI 텍스트 투명도 협상 관련 타입들
export interface AITextRequest {
  id: string
  category: string
  selectedText: string
  aiSuggestion: string
  createdAt: string
}

export interface AITextEdit {
  requestId: string
  editCount: number
  originalText: string
  editedText: string
  timestamp: string
}

export type AICategory = 'interpretive' | 'narrative' | 'causal' | 'reflective';
