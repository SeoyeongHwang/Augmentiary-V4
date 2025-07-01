export interface User {
  id: string
  email: string
  name: string
  participant_code: string
  created_at: string
  profile?: string
}

export interface CreateUserData {
  id: string
  email: string
  name: string
  participant_code: string
  profile?: string
} 