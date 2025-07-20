export interface Entry {
  id: string
  participant_code: string
  title: string
  content_html: string
  shared: boolean
  created_at: string
  sum_event?: string
  sum_innerstate?: string
  sum_insight?: string
  // 추가 메트릭 필드들 (선택적)
  left_panel_requests?: number
  right_panel_requests?: number
  left_panel_insertions?: number
  right_panel_insertions?: number
  ai_texts_added?: string // JSON 문자열
  syllable_count?: number
}

export interface CreateEntryData {
  participant_code: string
  title: string
  content_html: string
  shared: boolean
  // 추가 메트릭 필드들 (선택적)
  left_panel_requests?: number
  right_panel_requests?: number
  left_panel_insertions?: number
  right_panel_insertions?: number
  ai_texts_added?: string // JSON 문자열
  syllable_count?: number
}
