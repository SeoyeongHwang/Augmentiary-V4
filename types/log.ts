export enum ActionType {
  START_WRITING = 'start_writing',
  SELECT_TEXT = 'select_text',
  DESELECT_TEXT = 'deselect_text',
  TRIGGER_AI = 'trigger_ai',
  RECEIVE_AI = 'receive_ai',
  SELECT_AI_TEXT = 'select_ai_text',
  INSERT_AI_TEXT = 'insert_ai_text',
  EDIT_AI_TEXT = 'edit_ai_text',
  EDIT_USER_TEXT = 'edit_user_text',
  SAVE_ENTRY = 'save_entry',
  TRIGGER_ESM = 'trigger_esm',
  SUBMIT_ESM = 'submit_esm',
  LOGOUT = 'logout',
  // 경험 살펴보기 기능 관련 로그
  REQUEST_RECORD = 'request_record',  // 경험 살펴보기 기능 쿼리했을 때
  RECEIVE_RECORD = 'receive_record',  // 경험 살펴보기 쿼리 응답을 받았을 때
  CHECK_RECORD = 'check_record'       // 일기 열어보았을 때
}

export interface InteractionLog {
  id: string
  participant_code: string
  entry_id?: string
  action_type: ActionType
  timestamp: string
  meta?: Record<string, any>
}

export interface CreateInteractionLogData {
  participant_code: string
  entry_id?: string
  action_type: ActionType
  meta?: Record<string, any>
}
