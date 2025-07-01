export interface Entry {
  id: string
  user_id: string
  title: string
  content_html: string
  shared: boolean
  created_at: string
}

export interface CreateEntryData {
  user_id: string
  title: string
  content_html: string
  shared: boolean
}
