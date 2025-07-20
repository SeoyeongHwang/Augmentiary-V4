export interface ESMResponse {
  id: string
  participant_code: string
  entry_id?: string
  SL: number
  SO: number
  REF1: number
  REF2: number
  RUM1: number
  RUM2: number
  THK1: number
  THK2: number
  submitted_at: string
}

export interface CreateESMResponseData {
  participant_code: string
  entry_id?: string
  SL: number
  SO: number
  REF1: number
  REF2: number
  RUM1: number
  RUM2: number
  THK1: number
  THK2: number
}
