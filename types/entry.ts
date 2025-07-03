export interface Entry {
  id: string
  participant_code: string
  title: string
  content_html: string
  shared: boolean
  created_at: string
}

export interface CreateEntryData {
  participant_code: string
  title: string
  content_html: string
  shared: boolean
}
