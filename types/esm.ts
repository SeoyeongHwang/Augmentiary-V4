export interface ESMResponse {
  id: string
  user_id: string
  entry_id?: string
  consent: boolean
  q1: number
  q2: number
  q3: number
  q4: number
  q5: number
  submitted_at: string
}

export interface CreateESMResponseData {
  user_id: string
  entry_id?: string
  consent: boolean
  q1: number
  q2: number
  q3: number
  q4: number
  q5: number
}
