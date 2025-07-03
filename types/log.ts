export enum ActionType {
  START_WRITING = 'start_writing',
  SELECT_TEXT = 'select_text',
  DESELECT_TEXT = 'deselect_text',
  TRIGGER_AI = 'trigger_ai',
  RECEIVE_AI = 'receive_ai',
  INSERT_AI_TEXT = 'insert_ai_text',
  EDIT_AI_TEXT = 'edit_ai_text',
  EDIT_MANUAL_TEXT = 'edit_manual_text',
  CLICK_SAVE = 'click_save',
  ESM_SUBMIT = 'esm_submit',
  LOGOUT = 'logout'
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
