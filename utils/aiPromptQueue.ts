import { supabase } from '../lib/supabase'
import { getCurrentKST } from '../lib/time'
import type { AIAgentResult } from '../types/ai'

interface QueuedAIPrompt {
  entry_id: string
  selected_text: string
  ai_suggestion: AIAgentResult
  participant_code: string
  created_at?: string
}

class AIPromptQueue {
  private queue: QueuedAIPrompt[] = []
  private isProcessing = false

  add(prompt: Omit<QueuedAIPrompt, 'created_at'>) {
    this.queue.push({
      ...prompt,
      created_at: getCurrentKST(),
    })
  }

  async flush(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return
    this.isProcessing = true
    const batch = this.queue.splice(0, this.queue.length)
    try {
      const insertData = batch.map(p => ({
        ...p,
        ai_suggestion: JSON.stringify(p.ai_suggestion),
      }))
      const { error } = await supabase.from('ai_prompts').insert(insertData)
      if (error) {
        console.error('❌ ai_prompts 일괄 저장 실패:', error)
        // 실패한 데이터는 다시 큐에 넣음
        this.queue.unshift(...batch)
      } else {
        console.log('✅ ai_prompts 일괄 저장 성공')
      }
    } catch (err) {
      console.error('❌ ai_prompts flush 중 예외:', err)
      this.queue.unshift(...batch)
    } finally {
      this.isProcessing = false
    }
  }

  async flushAll(): Promise<void> {
    if (this.queue.length > 0) {
      await this.flush()
    }
  }
}

export const aiPromptQueue = new AIPromptQueue()

export function addAIPromptToQueue(prompt: Omit<QueuedAIPrompt, 'created_at'>) {
  aiPromptQueue.add(prompt)
}

export async function flushAIPromptsAfterEntrySave() {
  await aiPromptQueue.flushAll()
} 