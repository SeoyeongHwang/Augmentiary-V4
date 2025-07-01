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
