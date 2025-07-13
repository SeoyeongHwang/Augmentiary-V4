import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state'
import { Extension } from '@tiptap/core'
import { AIHighlight } from '../utils/tiptapExtensions'
import { Button, Heading, Card, Textarea, TextInput } from './index'
import { ArrowUturnLeftIcon, ArrowUturnRightIcon, ArchiveBoxIcon, DocumentTextIcon, SparklesIcon, BoldIcon, ItalicIcon, CommandLineIcon, LinkIcon, LightBulbIcon, CheckIcon, PlusIcon } from "@heroicons/react/24/outline";
import { LoaderIcon, ArchiveIcon, SparkleIcon, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import CircleIconButton from './CircleIconButton';
import JournalModal from './JournalModal';
import { Nanum_Myeongjo } from 'next/font/google'
import { 
  generateRequestId, 
  findAITextElement, 
  createAITextAttributes,
  calculateBackgroundOpacity,
  getBackgroundColor,
  debounce
} from '../utils/editorHelpers'
import { calculateEditRatio } from '../utils/diff'
import type { AICategory, AIAgentResult } from '../types/ai'
import { useInteractionLog } from '../hooks/useInteractionLog'
import { useSession } from '../hooks/useSession'
import { ActionType } from '../types/log'
import { logInteractionAsync } from '../lib/logger'
import { saveAIPrompt } from '../lib/augmentAgents'
import Placeholder from '@tiptap/extension-placeholder'
import { addAIPromptToQueue } from '../utils/aiPromptQueue'

const namum = Nanum_Myeongjo({
    subsets: ['latin'],
    weight: ['400', '700', '800'],
  })

export default function Editor({ 
  userId, 
  entryId,
  onTitleChange, 
  onContentChange,
  onSave
}: { 
  userId: string
  entryId: string
  onTitleChange?: (title: string) => void
  onContentChange?: (content: string) => void
  onSave?: () => void
}) {
  const [editorContent, setEditorContent] = useState('');
  const [title, setTitle] = useState('')
  const [previousContent, setPreviousContent] = useState('')
  
  // 인터랙션 로그 훅 사용
  const { 
    logAITrigger, 
    logAIReceive, 
    logAITextInsert, 
    logRequestRecord,
    logReceiveRecord,
    logCheckRecord,
    logTextEdit,
    logAsync,
    canLog 
  } = useInteractionLog()

  // 세션 정보 가져오기
  const { user } = useSession()

  // 변화 감지용 ref (필요한 것만 유지)
  const lastReceiveAI = useRef<string>('')
  
  // 텍스트 편집 로그를 위한 상태
  const previousTextRef = useRef<string>('')
  
  // 디바운스용 ref
  const aiTextEditTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // 로그 상태를 ref로 관리 (클로저 문제 해결)
  const canLogRef = useRef<boolean>(false)
  const entryIdRef = useRef<string>('')
  const userRef = useRef<any>(null)
  
  // ref 값을 실시간으로 업데이트
  useEffect(() => {
    canLogRef.current = canLog
    entryIdRef.current = entryId
    userRef.current = user
  }, [canLog, entryId, user])
  
  // Transaction 기반 텍스트 편집 로그 Plugin
  const createTextEditLogPlugin = useCallback(() => {
    const getWordCount = (text: string) => {
      return text.trim().split(/\s+/).filter(word => word.length > 0).length
    }
    
    // 이전 상태를 추적
    let lastLoggedText = ''
    let lastActivityTime = 0
    let pendingLogTimeout: NodeJS.Timeout | null = null
    
    // AI 텍스트 영역과 변경 범위가 겹치는지 확인하는 함수
    const isChangeInAIText = (transactions: readonly Transaction[], oldState: any, newState: any) => {
      for (const tr of transactions) {
        if (tr.docChanged) {
          // 변경된 범위 확인
          for (let i = 0; i < tr.steps.length; i++) {
            const step = tr.steps[i] as any
            if (step.from !== undefined && step.to !== undefined) {
              const changeFrom = step.from
              const changeTo = Math.max(step.to, changeFrom) // to가 from보다 작을 수 있음
              
              // oldState에서 AI 마크 확인 (삭제/수정되는 부분)
              let foundAIMarkInOld = false
              try {
                oldState.doc.nodesBetween(changeFrom, changeTo, (node: any, pos: number) => {
                  if (node.isText && node.marks) {
                    const hasAIMark = node.marks.some((mark: any) => mark.type.name === 'aiHighlight')
                    if (hasAIMark) {
                      foundAIMarkInOld = true
                      return false // 찾았으면 중단
                    }
                  }
                })
              } catch (e) {
                // 범위가 잘못된 경우 무시
              }
              
              if (foundAIMarkInOld) {
                console.log('🔍 [AI_DETECTION] Found AI mark in OLD state at:', changeFrom, '-', changeTo)
                return true
              }
              
              // newState에서도 AI 마크 확인 (새로 추가되는 부분)
              let foundAIMarkInNew = false
              try {
                const newChangeFrom = changeFrom
                const newChangeTo = Math.min(changeFrom + Math.max(0, (step.slice?.content?.size || 0)), newState.doc.content.size)
                
                if (newChangeTo > newChangeFrom) {
                  newState.doc.nodesBetween(newChangeFrom, newChangeTo, (node: any, pos: number) => {
                    if (node.isText && node.marks) {
                      const hasAIMark = node.marks.some((mark: any) => mark.type.name === 'aiHighlight')
                      if (hasAIMark) {
                        foundAIMarkInNew = true
                        return false // 찾았으면 중단
                      }
                    }
                  })
                }
              } catch (e) {
                // 범위가 잘못된 경우 무시
              }
              
              if (foundAIMarkInNew) {
                console.log('🔍 [AI_DETECTION] Found AI mark in NEW state at:', changeFrom)
                return true
              }
            }
          }
        }
      }
      return false
    }
    
    return Extension.create({
      name: 'textEditLog',
      addProseMirrorPlugins() {
        return [
          new Plugin({
            key: new PluginKey('textEditLog'),
            appendTransaction(transactions, oldState, newState) {
              // ref를 통해 실시간으로 로그 가능 상태 계산
              const currentCanLog = userRef.current?.participant_code && entryIdRef.current
              
              if (!currentCanLog) return null
              
              // 강제 저장 로그 처리 (저장 직전 미완료 변경사항 로깅)
              const hasForceSaveLog = transactions.some(tr => tr.getMeta('forceSaveLog'))
              if (hasForceSaveLog) {
                const currentText = transactions.find(tr => tr.getMeta('currentText'))?.getMeta('currentText') || newState.doc.textContent
                
                // 마지막 로그된 텍스트와 현재 텍스트가 다르면 강제 로깅
                if (lastLoggedText !== currentText) {
                  const editData = {
                    changeType: currentText.length > lastLoggedText.length ? 'insert' : 
                               currentText.length < lastLoggedText.length ? 'delete' : 'replace',
                    position: 0,
                    oldText: lastLoggedText.slice(0, 100),
                    newText: currentText.slice(0, 100),
                    oldLength: lastLoggedText.length,
                    newLength: currentText.length,
                    wordCountBefore: getWordCount(lastLoggedText),
                    wordCountAfter: getWordCount(currentText),
                    characterCountBefore: lastLoggedText.length,
                    characterCountAfter: currentText.length
                  }
                  
                  console.log('💾 [FORCE_SAVE_LOG] 저장 직전 강제 로깅 실행:', editData)
                  
                  if (canLogRef.current && entryIdRef.current && userRef.current?.participant_code) {
                    const logData = {
                      participant_code: userRef.current.participant_code,
                      action_type: ActionType.EDIT_USER_TEXT,
                      meta: editData,
                      entry_id: entryIdRef.current
                    }
                    
                    logInteractionAsync(logData)
                    lastLoggedText = currentText // 로그된 텍스트 상태 업데이트
                  }
                }
                
                return null // 강제 로깅 처리 후 종료
              }
              
              // 텍스트 변경이 있었는지 확인
              const oldText = oldState.doc.textContent
              const newText = newState.doc.textContent
              
              if (oldText === newText) return null
              
              // AI 텍스트 삽입인지 확인
              const hasAIInsert = transactions.some(tr => tr.getMeta('aiTextInsert'))
              if (hasAIInsert) {
                console.log('🤖 [AI_TEXT_INSERT] AI 텍스트 삽입 감지:', {
                  oldLength: oldText.length,
                  newLength: newText.length,
                  lengthDiff: newText.length - oldText.length
                })
                
                // AI 텍스트 삽입을 간단하게 로깅 (INSERT_AI_TEXT 사용)
                if (lastLoggedText !== newText && canLogRef.current && entryIdRef.current && userRef.current?.participant_code) {
                  const insertData = {
                    changeType: 'initial_insert' as const
                  }
                  
                  console.log('🤖 [AI_TEXT_INSERT_LOG]:', insertData)
                  
                  const logData = {
                    participant_code: userRef.current.participant_code,
                    action_type: ActionType.INSERT_AI_TEXT,
                    meta: insertData,
                    entry_id: entryIdRef.current
                  }
                  
                  logInteractionAsync(logData)
                  lastLoggedText = newText // 상태 업데이트로 다음 편집의 정확한 기준점 제공
                }
                
                return null
              }
              
              // 모든 메타데이터 확인 (디버깅용)
              const allMetaKeys = new Set<string>()
              const metaDetails: any = {}
              transactions.forEach((tr, index) => {
                // 트랜잭션의 모든 메타데이터 키 수집
                const metaKeys = Object.keys((tr as any).meta || {})
                metaKeys.forEach(key => {
                  allMetaKeys.add(key)
                  metaDetails[key] = tr.getMeta(key)
                })
              })
              
              // AI 텍스트 편집인지 확인
              const isAITextEdit = isChangeInAIText(transactions, oldState, newState)
              
              console.log('🔍 [EDIT_DETECTION]:', {
                isAITextEdit,
                hasHistoryMeta: transactions.some(tr => tr.getMeta('history$') !== undefined),
                isAddedToHistory: transactions.some(tr => tr.getMeta('addToHistory') !== false && tr.docChanged),
                textChange: `"${oldText}" -> "${newText}"`,
                lengthChange: `${oldText.length} -> ${newText.length}`
              })
              
              // AI 텍스트 편집인데 감지되지 않는 경우 추가 디버깅
              if (!isAITextEdit) {
                console.log('🔍 [DEBUG_AI_DETECTION] Checking why AI text not detected...')
                
                // 문서 전체에서 AI 마크 위치 확인
                const aiMarksInOld: any[] = []
                const aiMarksInNew: any[] = []
                
                oldState.doc.descendants((node: any, pos: number) => {
                  if (node.isText && node.marks) {
                    node.marks.forEach((mark: any) => {
                      if (mark.type.name === 'aiHighlight') {
                        aiMarksInOld.push({ pos, length: node.textContent.length, text: node.textContent.slice(0, 20) })
                      }
                    })
                  }
                })
                
                newState.doc.descendants((node: any, pos: number) => {
                  if (node.isText && node.marks) {
                    node.marks.forEach((mark: any) => {
                      if (mark.type.name === 'aiHighlight') {
                        aiMarksInNew.push({ pos, length: node.textContent.length, text: node.textContent.slice(0, 20) })
                      }
                    })
                  }
                })
                
                console.log('🔍 [AI_MARKS] Old state AI marks:', aiMarksInOld)
                console.log('🔍 [AI_MARKS] New state AI marks:', aiMarksInNew)
                
                // 변경 범위 확인
                transactions.forEach(tr => {
                  if (tr.docChanged) {
                    tr.steps.forEach((step: any, i) => {
                      console.log(`🔍 [STEP ${i}] from: ${step.from}, to: ${step.to}, stepType: ${step.constructor.name}`)
                    })
                  }
                })
              }
              
              // 시간 기반 디바운싱 (500ms) + 메타데이터 확인 + 5자 이상 변경 조건
              const currentTime = Date.now()
              const timeSinceLastActivity = currentTime - lastActivityTime
              lastActivityTime = currentTime
              
              // ProseMirror History 플러그인의 실제 그룹 감지
              const hasHistoryMeta = transactions.some(tr => {
                const historyMeta = tr.getMeta('history$')
                return historyMeta !== undefined
              })
              
              // 히스토리에 추가되는 트랜잭션 감지 (실제 Undo 지점 결정)
              const isAddedToHistory = transactions.some(tr => {
                const addToHistory = tr.getMeta('addToHistory')
                return addToHistory !== false && tr.docChanged
              })
              
              // 새로운 히스토리 그룹 시작 조건 체크 (ProseMirror의 newGroupDelay와 일치)
              const isNewHistoryGroup = timeSinceLastActivity > 500 && isAddedToHistory
              
              // 메타데이터가 있는 경우에만 자세히 로깅
              if (allMetaKeys.size > 0) {
                console.log('📝 [APPEND_TRANSACTION] History group detected:', {
                  hasHistoryMeta: hasHistoryMeta,
                  oldLength: oldText.length,
                  newLength: newText.length,
                  lastLoggedLength: lastLoggedText.length,
                  allMetaKeys: Array.from(allMetaKeys),
                  metaDetails: metaDetails
                })
              }
              
              // 기존 타이머 정리
              if (pendingLogTimeout) {
                clearTimeout(pendingLogTimeout)
                pendingLogTimeout = null
              }
              
              // 로그 실행 함수
              const performLog = (reason?: string, textToLog?: string) => {
                // 로그할 텍스트 결정 (매개변수로 받은 텍스트 또는 기본값)
                const currentText = textToLog || newText
                
                // 변경 타입 결정
                let changeType: 'insert' | 'delete' | 'replace' = 'replace'
                if (lastLoggedText.length < currentText.length) {
                  changeType = 'insert'
                } else if (lastLoggedText.length > currentText.length) {
                  changeType = 'delete'
                }
                
                const oldLen = (lastLoggedText || oldText).length
                const newLen = currentText.length
                const wordCountBefore = getWordCount(lastLoggedText || oldText)
                const wordCountAfter = getWordCount(currentText)
                const characterCountBefore = oldLen
                const characterCountAfter = newLen
                
                const editData = {
                  changeType,
                  position: 0,
                  length: newLen,
                  lengthDiff: newLen - oldLen,
                  wordCount: wordCountAfter,
                  wordCountDiff: wordCountAfter - wordCountBefore,
                  characterCount: characterCountAfter,
                  characterCountDiff: characterCountAfter - characterCountBefore,
                  currentText: currentText
                }
                
                console.log(`📝 [TEXT_EDIT] Logging edit (${reason || 'AppendTransaction-based'}):`, editData)
                
                // 직접 logInteractionAsync 호출
                if (canLogRef.current && entryIdRef.current && userRef.current?.participant_code) {
                  const logData = {
                    participant_code: userRef.current.participant_code,
                    action_type: ActionType.EDIT_USER_TEXT,
                    meta: editData,
                    entry_id: entryIdRef.current
                  }
                  
                  logInteractionAsync(logData)
                } else {
                  console.log('❌ [DIRECT_LOG] Cannot log - missing conditions')
                }
                
                // 로그된 텍스트 상태 업데이트
                lastLoggedText = currentText
              }
              
              // AI 텍스트 편집용 로깅 함수 (manual 텍스트 편집과 동일한 구조)
              const performAILog = (reason?: string, textToLog?: string) => {
                const currentText = textToLog || newText
                
                // 변경 타입 결정
                let changeType: 'insert' | 'delete' | 'replace' = 'replace'
                if (lastLoggedText.length < currentText.length) {
                  changeType = 'insert'
                } else if (lastLoggedText.length > currentText.length) {
                  changeType = 'delete'
                }
                
                const oldLen = (lastLoggedText || oldText).length
                const newLen = currentText.length
                const wordCountBefore = getWordCount(lastLoggedText || oldText)
                const wordCountAfter = getWordCount(currentText)
                const characterCountBefore = oldLen
                const characterCountAfter = newLen
                
                const editData = {
                  changeType,
                  position: 0,
                  length: newLen,
                  lengthDiff: newLen - oldLen,
                  wordCount: wordCountAfter,
                  wordCountDiff: wordCountAfter - wordCountBefore,
                  characterCount: characterCountAfter,
                  characterCountDiff: characterCountAfter - characterCountBefore,
                  currentText: currentText
                }
                
                console.log(`🤖 [AI_TEXT_EDIT] Logging AI edit (${reason || 'AppendTransaction-based'}):`, editData)
                
                // 직접 logInteractionAsync 호출
                if (canLogRef.current && entryIdRef.current && userRef.current?.participant_code) {
                  const logData = {
                    participant_code: userRef.current.participant_code,
                    action_type: ActionType.EDIT_AI_TEXT,
                    meta: editData,
                    entry_id: entryIdRef.current
                  }
                  
                  logInteractionAsync(logData)
                } else {
                  console.log('❌ [AI_LOG] Cannot log - missing conditions')
                }
                
                // 로그된 텍스트 상태 업데이트
                lastLoggedText = currentText
              }
              
              // 로그 실행 조건: 히스토리 그룹 완료 시점에서 누적 변경사항 로깅
              if (hasHistoryMeta) {
                // Undo/Redo 작업 시 즉시 로그
                if (isAITextEdit) {
                  performAILog('History Meta - Undo/Redo Unit (AI Text)')
                } else {
                  performLog('History Meta - Undo/Redo Unit')
                }
              } else if (isAddedToHistory) {
                // 히스토리 그룹 완료 감지를 위한 타이머 설정
                if (pendingLogTimeout) {
                  clearTimeout(pendingLogTimeout)
                }
                
                // 500ms 후 히스토리 그룹이 완료되면 누적 변경사항 로깅
                pendingLogTimeout = setTimeout(() => {
                  // 현재 에디터 상태 확인 (newState 캡처)
                  const currentText = newState.doc.textContent
                  
                  // 마지막 로그와 현재 텍스트가 다르면 히스토리 그룹 완료로 간주
                  if (lastLoggedText !== currentText) {
                    if (isAITextEdit) {
                      performAILog('History Group Complete - Accumulated Changes (AI Text)', currentText)
                    } else {
                      performLog('History Group Complete - Accumulated Changes', currentText)
                    }
                  }
                }, 500) // Tiptap의 newGroupDelay와 일치
              } else {
                // 히스토리에 추가되지 않는 트랜잭션 (중간 상태)
                console.log('⏸️ [WAITING] 히스토리 추가 대기 중...')
              }
              
                              return null // appendTransaction은 새 트랜잭션을 반환하거나 null 반환
              },
              destroy() {
                // Plugin 종료 시 타이머 정리
                if (pendingLogTimeout) {
                  clearTimeout(pendingLogTimeout)
                  pendingLogTimeout = null
                }
              }
            })
          ]
        }
    })
  }, [logTextEdit])

  // 텍스트 편집 로그를 위한 유틸리티 함수들
  const getWordCount = useCallback((text: string) => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length
  }, [])

  const getChangeType = useCallback((oldText: string, newText: string, position: number) => {
    if (oldText.length === newText.length) {
      return 'replace'
    } else if (oldText.length < newText.length) {
      return 'insert'
    } else {
      return 'delete'
    }
  }, [])

  const detectTextEdit = useCallback((newContent: string) => {
    // Transaction 기반 Plugin으로 대체됨 - 이 함수는 더 이상 사용되지 않음
    return
  }, [])

  // 제목 변경 시 외부로 알림
  useEffect(() => {
    if (onTitleChange) {
      onTitleChange(title)
    }
  }, [title, onTitleChange])
  
  const [augments, setAugments] = useState<{ start: number; end: number; inserted: string; requestId: string; category: AICategory; originalText: string }[]>([])
  const [userInfo, setBeliefSummary] = useState('')
  const [augmentOptions, setAugmentOptions] = useState<AIAgentResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [fontMenuOpen, setFontMenuOpen] = useState(false)
  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const [bubbleMenuLoading, setBubbleMenuLoading] = useState(false)
  const [bubbleMenuOptions, setBubbleMenuOptions] = useState<AIAgentResult | null>(null)
  const [bubbleMenuPosition, setBubbleMenuPosition] = useState<{ from: number; to: number } | null>(null)
  const [experienceButtonLoading, setExperienceButtonLoading] = useState(false)
  const [experienceOptions, setExperienceOptions] = useState<any>(null)
  const [augmentVisible, setAugmentVisible] = useState(true);
  const [experienceVisible, setExperienceVisible] = useState(true);
  const [experienceCollapsed, setExperienceCollapsed] = useState(false);
  const [augmentCollapsed, setAugmentCollapsed] = useState(false);
  
  // 원본 일기 모달 상태
  const [originalEntryModal, setOriginalEntryModal] = useState({
    isOpen: false,
    title: '',
    content: '',
    createdAt: '',
    loading: false
  })
  
  // 디바운스용 ref
  useEffect(() => {
    const options = bubbleMenuOptions || augmentOptions
    if (options && canLog && entryId) {
      // 중복 체크를 위한 문자열 생성
      const optionsString = JSON.stringify(options)
      if (lastReceiveAI.current !== optionsString) {
        logAIReceive(entryId, options)
        lastReceiveAI.current = optionsString
      }
    }
  }, [bubbleMenuOptions, augmentOptions, canLog, entryId, logAIReceive])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: {
          newGroupDelay: 500, // 500ms 그룹 딜레이 (기본값)
        },
      }),
      AIHighlight,
      Placeholder.configure({
        placeholder: '요즘 마음 속에 머물고 있는 이야기들을 써 보세요',
        emptyEditorClass: 'is-editor-empty',
      }),
      createTextEditLogPlugin(),
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-sm mx-auto focus:outline-none leading-loose',
      },
    },
    editable: !loading && !bubbleMenuLoading && !experienceButtonLoading, // AI 요청 중에는 편집 불가
    immediatelyRender: false,
    onUpdate: ({ editor }: { editor: any }) => {
      const content = editor.getHTML()
      
      // HTML 최적화 (불필요한 태그 제거)
      const optimizedContent = content
        .replace(/<p><br><\/p>/g, '') // 빈 단락 제거
        .replace(/<p>\s*<\/p>/g, '') // 빈 내용의 단락 제거
        .replace(/\s+/g, ' ') // 연속된 공백을 하나로
        .trim()
      
      setEditorContent(optimizedContent)
      if (onContentChange) {
        onContentChange(optimizedContent)
      }
      
      // AI 텍스트 편집 감지 (디바운스 적용)
      if (aiTextEditTimeoutRef.current) {
        clearTimeout(aiTextEditTimeoutRef.current)
      }
      aiTextEditTimeoutRef.current = setTimeout(() => {
        handleAITextEdit()
      }, 300) // 디바운스 시간을 300ms로 증가
    },
    onSelectionUpdate: ({ editor }: { editor: any }) => {
      // 텍스트 선택 로그 제거됨
    },
    
  })

  // 사용자 프로필 가져오기 - 서버사이드 API 사용 대신 useSession의 user 데이터 활용
  useEffect(() => {
    // user 객체에 profile이 있으면 사용, 없으면 빈 문자열
    if (user?.profile) {
      setBeliefSummary(user.profile)
    } else {
      setBeliefSummary('') // 기본값으로 빈 문자열 설정
    }
  }, [user])

  // AI 하이라이트 색상 설정 (기본값만 설정)
  useEffect(() => {
    // 기본 초록색 배경으로 설정 (localStorage 복원 제거)
    document.documentElement.style.setProperty('--ai-highlight-bg', 'rgba(207, 255, 204, 1)')
  }, [])

  // AI 요청 상태에 따라 에디터 편집 가능 상태 업데이트
  useEffect(() => {
    if (editor) {
      editor.setEditable(!loading && !bubbleMenuLoading && !experienceButtonLoading)
      
      // 에디터 초기화 시 이전 텍스트 설정
      if (previousTextRef.current === '') {
        previousTextRef.current = editor.state.doc.textContent
      }
    }
  }, [editor, loading, bubbleMenuLoading, experienceButtonLoading])

  // 관련 경험 떠올리기 함수
  const handleExperienceRecall = useCallback(async () => {
    if (!user || !user.participant_code) {
      alert('로그인 정보가 없거나 참가자 코드가 없습니다. 다시 로그인 해주세요.');
      return;
    }
    if (experienceButtonLoading || !editor) return

    const { from, to } = editor.state.selection
    if (from === to) return

    const selectedText = editor.state.doc.textBetween(from, to).trim()
    if (!selectedText) return

    // 경험 살펴보기 요청 로그 (REQUEST_RECORD)
    if (canLog && entryId) {
      logRequestRecord(entryId, selectedText)
    }

    setExperienceButtonLoading(true)

    try {
      // 경험 관련 API 호출
      const res = await fetch('/api/experience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedText: selectedText,
          currentEntryId: entryId,
          participantCode: user.participant_code
        })
      })

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const data = await res.json()
      
      const experiences = data.data.experiences || []
      
      // 경험 살펴보기 응답 수신 로그 (RECEIVE_RECORD)
      if (canLog && entryId) {
        logReceiveRecord(entryId, experiences)
      }
      
      setExperienceOptions({
        selectedText: selectedText,
        experiences: experiences
      })

      // 응답 후 선택 해제하여 버블 메뉴 숨기기
      setTimeout(() => {
        if (editor) {
          editor.commands.setTextSelection(to)
        }
      }, 100)
    } catch (error) {
      console.error('Error fetching experience options:', error)
      alert('이전 경험에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setExperienceButtonLoading(false)
    }
  }, [experienceButtonLoading, editor, user, canLog, entryId, logRequestRecord, logReceiveRecord])

  // 원본 일기 가져오기 함수
  const handleViewOriginalEntry = useCallback(async (originalEntryId: string) => {
    if (!user || !user.participant_code) {
      setOriginalEntryModal({
        isOpen: true,
        title: '오류',
        content: '<p>로그인 정보가 없습니다. 다시 로그인해주세요.</p>',
        createdAt: '',
        loading: false
      })
      return
    }

    // 모달을 열면서 데이터 초기화 및 로딩 상태로 설정
    setOriginalEntryModal({
      isOpen: true,
      title: '',
      content: '',
      createdAt: '',
      loading: true
    })

    try {
      // localStorage에서 세션 정보 가져오기
      const sessionData = localStorage.getItem('supabase_session')
      if (!sessionData) {
        throw new Error('세션 정보가 없습니다. 다시 로그인해주세요.')
      }

      const session = JSON.parse(sessionData)
      if (!session.access_token) {
        throw new Error('액세스 토큰이 없습니다. 다시 로그인해주세요.')
      }

      // 새로운 개별 일기 조회 API 사용
      const response = await fetch(`/api/entries/${originalEntryId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        
        if (response.status === 404) {
          // 일기를 찾을 수 없는 경우
          setOriginalEntryModal({
            isOpen: true,
            title: '일기를 찾을 수 없습니다',
            content: '<p>죄송합니다. 해당 일기를 찾을 수 없습니다.</p><p>일기가 삭제되었거나 접근 권한이 없을 수 있습니다.</p>',
            createdAt: '',
            loading: false
          })
          return
        } else if (response.status === 401) {
          // 인증 오류
          setOriginalEntryModal({
            isOpen: true,
            title: '인증 오류',
            content: '<p>세션이 만료되었습니다.</p><p>다시 로그인해주세요.</p>',
            createdAt: '',
            loading: false
          })
          return
        } else {
          throw new Error(errorData?.message || '일기를 가져오는 데 실패했습니다.')
        }
      }

      const data = await response.json()
      const entry = data.data.entry
      
      if (!entry) {
        setOriginalEntryModal({
          isOpen: true,
          title: '일기를 찾을 수 없습니다',
          content: '<p>죄송합니다. 해당 일기를 찾을 수 없습니다.</p>',
          createdAt: '',
          loading: false
        })
        return
      }

      // 일기 열어보기 로그 (CHECK_RECORD)
      if (canLog && entryId) {
        logCheckRecord(entryId, originalEntryId)
      }

      setOriginalEntryModal({
        isOpen: true,
        title: entry.title || '무제',
        content: entry.content_html || '',
        createdAt: entry.created_at,
        loading: false
      })
    } catch (error) {
      console.error('원본 일기 조회 오류:', error)
      
      // 사용자 친화적인 에러 모달 표시
      const errorMessage = error instanceof Error ? error.message : '일기를 불러오는 데 실패했습니다.'
      setOriginalEntryModal({
        isOpen: true,
        title: '오류 발생',
        content: `<p>${errorMessage}</p><p>잠시 후 다시 시도해주세요.</p>`,
        createdAt: '',
        loading: false
      })
    }
  }, [user, canLog, entryId, logCheckRecord])

  // BubbleMenu용 AI API 호출 함수 (useCallback으로 메모이제이션)
  const handleMeaningAugment = useCallback(async () => {
    
    
    if (!user || !user.participant_code) {
      alert('로그인 정보가 없거나 참가자 코드가 없습니다. 다시 로그인 해주세요.');
      return;
    }
    if (bubbleMenuLoading || !editor) return

    const { from, to } = editor.state.selection
    if (from === to) return

    const selectedText = editor.state.doc.textBetween(from, to).trim()
    if (!selectedText) return

    // AI 호출 로그 기록
    if (canLog && entryId) {
      logAITrigger(entryId, selectedText)
    }

    setBubbleMenuLoading(true)
    setBubbleMenuPosition({ from, to })
    
    const fullText = editor.state.doc.textContent
    const diaryEntryMarked = fullText.slice(0, to) + ' <<INSERT HERE>> ' + fullText.slice(to)

    try {
      const res = await fetch('/api/augment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          diaryEntry: fullText,
          diaryEntryMarked: diaryEntryMarked,
          userProfile: userInfo,
          entryId: entryId,
          participantCode: user.participant_code,
          selectedText: selectedText,
        }),
      })
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      
      const data = await res.json()
      if (data.interpretiveAgentResult) {
        const aiSuggestions = data.interpretiveAgentResult;

        // AI 응답을 ai_prompts 테이블에 저장
        if (user?.participant_code && selectedText) {
          addAIPromptToQueue({
            entry_id: entryId,
            selected_text: selectedText,
            ai_suggestion: aiSuggestions,
            participant_code: user.participant_code,
          });
        }

        setAugmentOptions(aiSuggestions)
      }

      // 응답 후 선택 해제하여 버블 메뉴 숨기기
      setTimeout(() => {
        if (editor) {
          editor.commands.setTextSelection(to)
        }
      }, 100)
    } catch (error) {
      console.error('Error fetching augment options:', error)
      alert('AI 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setBubbleMenuLoading(false)
    }
  }, [bubbleMenuLoading, editor, userInfo, canLog, entryId, logAITrigger, user])

  // AI 텍스트 편집 감지 및 투명도 업데이트 (직접 스타일 적용)
  const handleAITextEdit = useCallback(() => {
    if (!editor) return

    const doc = editor.state.doc
    const tr = editor.state.tr
    let hasChanges = false
    
    // 문서 전체를 순회하면서 AI 하이라이트 마크 찾기
    doc.descendants((node, pos) => {
      if (node.isText && node.marks.length > 0) {
        const aiMark = node.marks.find(mark => mark.type.name === 'aiHighlight')
        if (aiMark) {
          const currentText = node.textContent || ''
          const originalText = aiMark.attrs.dataOriginal
          
          // data-original이 있는 경우에만 투명도 계산 (AI 텍스트만)
          if (originalText) {
            const editRatio = calculateEditRatio(originalText, currentText)
            const opacity = Math.max(0, 1 - editRatio)
            
            // 기존 스타일에서 배경색만 추출
            const existingStyle = aiMark.attrs.style || ''
            const currentBgColor = getComputedStyle(document.documentElement).getPropertyValue('--ai-highlight-bg').trim() || 'rgba(207, 255, 204, 1)'
            const backgroundColor = opacity > 0 
              ? currentBgColor.replace('1)', `${opacity})`) 
              : 'transparent'
            
            // 새로운 스타일로 마크 업데이트
            const newMark = aiMark.type.create({
              ...aiMark.attrs,
              editRatio: editRatio.toString(),
              style: `background-color: ${backgroundColor};`
            })
            
            tr.removeMark(pos, pos + node.nodeSize, aiMark)
            tr.addMark(pos, pos + node.nodeSize, newMark)
            hasChanges = true
          }
        }
      }
    })
    
    if (hasChanges) {
      editor.view.dispatch(tr)
    }
  }, [editor])

  // AI 하이라이트 색상 옵션들
  const highlightColors = [
    { name: 'blue', color: '#D2FBFF', bgColor: 'rgba(210, 251, 255, 1)' },
    { name: 'green', color: '#CFFFCC', bgColor: 'rgba(207, 255, 204, 1)' },
    { name: 'purple', color: '#F2E7FF', bgColor: 'rgba(242, 231, 255, 1)' },
    { name: 'pink', color: '#FFE7EF', bgColor: 'rgba(255, 231, 239, 1)' },
    { name: 'yellow', color: '#FFFEA7', bgColor: 'rgba(255, 254, 167, 1)' },
  ]

  const applyFontSize = (value: string) => {
    const sizeMap: Record<string, string> = {
      small: '0.85rem',
      normal: '1rem',
      large: '1.25rem',
      huge: '1.5rem',
    }
    if (editor) {
      editor.view.dom.style.fontSize = sizeMap[value] || '1rem'
    }
  }

  const applyHighlightColor = (colorName: string) => {
    const selectedColor = highlightColors.find(c => c.name === colorName)
    if (selectedColor) {
      // localStorage에 색상 설정 저장 (참고용으로만 유지)
      localStorage.setItem('ai-highlight-color', colorName)
      
      // CSS 변수로 배경색 설정
      document.documentElement.style.setProperty('--ai-highlight-bg', selectedColor.bgColor)
      
      // 기존 AI 텍스트들의 인라인 스타일을 즉시 업데이트 (HTML 저장 시 이 색상이 저장됨)
      updateExistingAITextColors(selectedColor.bgColor)
    }
  }

  // 기존 AI 텍스트들의 색상을 업데이트하는 함수
  const updateExistingAITextColors = (newBgColor: string) => {
    if (!editor) return
    
    const doc = editor.state.doc
    const tr = editor.state.tr
    let hasChanges = false
    
    // 문서 전체를 순회하면서 AI 하이라이트 마크 찾기
    doc.descendants((node, pos) => {
      if (node.isText && node.marks.length > 0) {
        const aiMark = node.marks.find(mark => mark.type.name === 'aiHighlight')
        if (aiMark) {
          const editRatio = parseFloat(aiMark.attrs.editRatio || '0')
          const opacity = Math.max(0, 1 - editRatio)
          const backgroundColor = opacity > 0 
            ? newBgColor.replace('1)', `${opacity})`) 
            : 'transparent'
          
          // 새로운 스타일로 마크 업데이트
          const newMark = aiMark.type.create({
            ...aiMark.attrs,
            style: `background-color: ${backgroundColor};`
          })
          
          tr.removeMark(pos, pos + node.nodeSize, aiMark)
          tr.addMark(pos, pos + node.nodeSize, newMark)
          hasChanges = true
        }
      }
    })
    
    if (hasChanges) {
      editor.view.dispatch(tr)
    }
  }

  // 저장 함수 (부모 컴포넌트에 위임)
  const handleSave = () => {
    // 저장 직전에 미완료된 텍스트 변경사항 강제 로깅
    if (editor && canLogRef.current && entryIdRef.current && userRef.current?.participant_code) {
      const currentText = editor.state.doc.textContent
      
      // Plugin의 강제 로깅 함수 호출을 위한 커스텀 트랜잭션 생성
      const tr = editor.state.tr
      tr.setMeta('forceSaveLog', true)
      tr.setMeta('currentText', currentText)
      editor.view.dispatch(tr)
      
      console.log('💾 [SAVE_FORCE_LOG] 저장 직전 미완료 텍스트 변경사항 강제 로깅')
    }
    
    if (onSave) {
      onSave()
    }
  }

  const handleAugment = async () => {
    if (!user || !user.participant_code) {
      alert('로그인 정보가 없거나 참가자 코드가 없습니다. 다시 로그인 해주세요.');
      return;
    }
    if (loading || !editor) return

    const { from, to } = editor.state.selection
    if (from === to) return alert('텍스트를 선택하세요.')

    const selectedText = editor.state.doc.textBetween(from, to).trim()
    if (!selectedText) return alert('텍스트를 선택하세요.')

    // AI 호출 로그 기록
    if (canLog && entryId) {
      logAITrigger(entryId, selectedText)
    }

    setLoading(true)
    
    const fullText = editor.state.doc.textContent
    const diaryEntryMarked = fullText.slice(0, to) + ' <<INSERT HERE>> ' + fullText.slice(to)

    try {
      const res = await fetch('/api/augment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          diaryEntry: fullText,
          diaryEntryMarked: diaryEntryMarked,
          userProfile: userInfo,
          entryId: entryId,
          participantCode: user.participant_code,
          selectedText: selectedText,
        }),
      })
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      
      const data = await res.json()
        if (data.interpretiveAgentResult) {
          const aiSuggestions = data.interpretiveAgentResult;
          const suggestions = [
            aiSuggestions.option1.text,
            aiSuggestions.option2.text,
            aiSuggestions.option3.text,
          ]

          // AI 응답을 ai_prompts 테이블에 저장
          if (user?.participant_code && selectedText) {
            addAIPromptToQueue({
              entry_id: entryId,
              selected_text: selectedText,
              ai_suggestion: aiSuggestions,
              participant_code: user.participant_code,
            });
          }

          setAugmentOptions(aiSuggestions)
        }
    } catch (error) {
      console.error('Error fetching augment options:', error)
      alert('AI 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  // AI 응답 삽입 함수: 항상 editor.state.selection을 사용
  const applyAugmentation = (inserted: string, selectedOption?: any) => {
    if (!editor) return;
    const { to } = editor.state.selection;
    const finalRequestId = generateRequestId();
    const category: AICategory = 'interpretive';

    // AI 텍스트 삽입 로그
    if (canLog && entryId) {
      logAITextInsert(entryId, selectedOption || inserted);
    }

    // 현재 선택된 색상 가져오기
    const currentBgColor = getComputedStyle(document.documentElement).getPropertyValue('--ai-highlight-bg').trim() || 'rgba(207, 255, 204, 1)'
    const editRatio = 0 // 새로 삽입된 텍스트는 수정되지 않음
    const opacity = Math.max(0, 1 - editRatio)
    const backgroundColor = opacity > 0 ? currentBgColor.replace('1)', `${opacity})`) : 'transparent'

    // AI 텍스트 삽입을 위한 트랜잭션 생성 (메타데이터 포함)
    const tr = editor.state.tr
    tr.setMeta('aiTextInsert', true)
    
    // 텍스트 삽입
    tr.insertText(inserted, to)
    
    // AI 하이라이트 마크 적용
    const aiHighlightMark = editor.schema.marks.aiHighlight.create({
      requestId: finalRequestId,
      category,
      dataOriginal: inserted,
      editRatio: '0',
      style: `background-color: ${backgroundColor};`
    })
    
    tr.addMark(to, to + inserted.length, aiHighlightMark)
    
    // 트랜잭션 실행
    editor.view.dispatch(tr)

    // DOM 속성 설정 (히스토리에 영향을 주지 않음)
    setTimeout(() => {
      const editorElement = editor.view.dom as HTMLElement;
      const aiElements = editorElement.querySelectorAll('mark[ai-text]');
      const lastElement = aiElements[aiElements.length - 1] as HTMLElement;
      
      if (lastElement) {
        const dataOriginal = lastElement.getAttribute('data-original');
        if (!dataOriginal) {
          lastElement.setAttribute('data-original', inserted);
          lastElement.setAttribute('request-id', finalRequestId);
          lastElement.setAttribute('category', category);
        }
      }

      // 텍스트 삽입 후 선택 해제하여 버블 메뉴 숨기기
      if (editor) {
        editor.commands.setTextSelection(to + inserted.length)
      }
    }, 50);

    setAugments((prev) => [...prev, {
      start: to,
      end: to + inserted.length,
      inserted,
      requestId: finalRequestId,
      category,
      originalText: inserted
    }]);
    setAugmentOptions(null);
  };

  // 로깅 시스템 검증을 위한 디버깅 함수
  const debugLoggingState = useCallback(() => {
    if (!editor) return
    
    const editorElement = editor.view.dom as HTMLElement
    const aiElements = editorElement.querySelectorAll('mark[ai-text]')
    
    // AI 텍스트가 있을 때만 상세 정보 출력
    if (aiElements.length > 0) {
      // 상세 정보는 개발자 도구에서만 확인하도록 주석 처리
      // const aiTextDetails = Array.from(aiElements).map((element, index) => {
      //   const htmlElement = element as HTMLElement
      //   return {
      //     index,
      //     text: element.textContent?.substring(0, 30) + '...',
      //     originalText: htmlElement.getAttribute('data-original')?.substring(0, 30) + '...',
      //     requestId: htmlElement.getAttribute('request-id'),
      //     category: htmlElement.getAttribute('category'),
      //     editRatio: htmlElement.getAttribute('edit-ratio')
      //   }
      // })
      // console.log('📝 AI 텍스트 상세 정보:', aiTextDetails)
    }
  }, [editor])

  // 개발자 도구에서 디버깅용 전역 함수들
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // (window as any).debugEditorLogging = debugLoggingState
      // ;(window as any).testAITextEdit = () => {
      //   console.log('🧪 AI 텍스트 편집 테스트 시작')
      //   handleAITextEdit()
      // }
      // ;(window as any).testEditRatio = (original: string, current: string) => {
      //   const ratio = calculateEditRatio(original, current)
      //   console.log('🧪 편집 비율 테스트:', { original, current, ratio })
      //   return ratio
      // }
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        // delete (window as any).debugEditorLogging
        // delete (window as any).testAITextEdit
        // delete (window as any).testEditRatio
      }
    }
  }, [debugLoggingState, handleAITextEdit])

  useEffect(() => {
    if (bubbleMenuOptions || augmentOptions) {
      setAugmentVisible(true);
    }
  }, [bubbleMenuOptions, augmentOptions]);

  useEffect(() => {
    if (experienceOptions) {
      setExperienceVisible(true);
    }
  }, [experienceOptions]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (aiTextEditTimeoutRef.current) {
        clearTimeout(aiTextEditTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="flex flex-col lg:flex-row h-auto lg:h-full w-full overflow-visible lg:overflow-hidden lg:justify-center bg-[#faf9f5] px-6 gap-4">
      {/* 왼쪽 패널: 경험 떠올리기 결과 */}
      <div className={`flex-1 max-w-full lg:max-w-sm min-w-0 flex flex-col h-fit pb-4 overflow-visible order-2 lg:order-1 ${
        experienceOptions && experienceVisible && !experienceCollapsed ? 'lg:h-full lg:overflow-hidden' : 'lg:overflow-visible'
      }`}>
        <div className={`px-0 lg:px-3 lg:pb-10 space-y-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 ${
          experienceOptions && experienceVisible && !experienceCollapsed ? 'lg:flex-1 lg:overflow-y-auto' : ''
        }`}>
        {/* 경험 관련 결과 */}
        {experienceOptions && experienceVisible && (
          <div className="bg-[#f5f4ed] border border-stone-300 rounded-lg shadow-md p-3 relative">
            {/* 로딩 중일 때 오버레이 (자체 로딩만) */}
            {experienceButtonLoading && (
              <div className="absolute inset-0 bg-gray-300 bg-opacity-50 rounded-lg z-10 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
                          <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button 
                    className={`p-2 hover:bg-stone-200 rounded-lg transition-colors flex items-center justify-center ${(experienceButtonLoading || bubbleMenuLoading) ? 'pointer-events-none' : ''}`}
                    onClick={() => setExperienceCollapsed(!experienceCollapsed)}
                    title={experienceCollapsed ? "펼치기" : "접기"}
                    disabled={experienceButtonLoading || bubbleMenuLoading}
                  >
                    {experienceCollapsed ? (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-gray-500" />
                    )}
                  </button>
                  <span className="font-bold text-l text-stone-800">맞닿은 경험 찾기</span>
                </div>
                <button
                  type="button"
                  aria-label="닫기"
                  className={`w-8 h-8 p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded-lg transition-colors flex items-center justify-center ${(experienceButtonLoading || bubbleMenuLoading) ? 'pointer-events-none' : ''}`}
                  onClick={() => setExperienceVisible(false)}
                  disabled={experienceButtonLoading || bubbleMenuLoading}
                >
                  <span className="text-lg font-bold">×</span>
                </button>
              </div>
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
              experienceCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
            }`}>
              <div className="text-stone-500 text-sm my-3">
                어떤 순간들이 지금과 맞닿아 있는지 살펴보세요.<br/>
              </div>
              {experienceOptions && experienceOptions.experiences && experienceOptions.experiences.length > 0 ? (
                experienceOptions.experiences.map((experience: any, index: number) => (
                  <div
                    key={experience.id || index}
                    className="w-full bg-white border border-stone-200 rounded-lg p-4 mb-2"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-l text-gray-900">{experience.strategy || '이전 경험 떠올려보기'}</span>
                    </div>
                    <div className="text-gray-800 text-[15px] leading-relaxed mb-3">
                      {experience.description || '관련된 과거 기록이 있습니다.'}
                    </div>
                    
                    {/* 내면 상태와 인사이트 요약 */}
                    {/* {(experience.sum_innerstate || experience.sum_insight) && (
                      <div className="space-y-1">
                        {experience.sum_innerstate && (
                          <div className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">
                            💭 {experience.sum_innerstate.substring(0, 50)}{experience.sum_innerstate.length > 50 ? '...' : ''}
                          </div>
                        )}
                        {experience.sum_insight && (
                          <div className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                            💡 {experience.sum_insight.substring(0, 50)}{experience.sum_insight.length > 50 ? '...' : ''}
                          </div>
                        )}
                      </div>
                    )} */}
                    
                    {/* 원본 보기 버튼 - 과거 맥락 카드가 아닌 경우에만 표시 */}
                    {!experience.isPastContext && (
                      <button
                        onClick={() => {
                          handleViewOriginalEntry(experience.id)
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 mt-3 bg-gray-50 hover:bg-gray-100 border border-stone-300 rounded-md transition-colors duration-200 ${(experienceButtonLoading || bubbleMenuLoading) ? 'pointer-events-none' : ''}`}
                        disabled={experienceButtonLoading || bubbleMenuLoading}
                      >
                        <span className="text-sm font-medium text-gray-700 truncate">
                          &lt;{experience.title || '무제'}&gt; 보기
                        </span>
                        <ExternalLink className="w-4 h-4 text-gray-500 flex-shrink-0 ml-2" />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-stone-400 text-sm text-center py-4">
                  연관된 이전 기록이 없습니다
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
      {/* 중앙 패널: 에디터 영역 */}
      <div className="flex-1 min-w-full lg:min-w-[700px] max-w-full lg:max-w-[700px] flex flex-col lg:flex-row h-[50vh] lg:h-[85vh] order-1 lg:order-2">
        {/* 에디터 툴바 */}
        <div className="flex-shrink-0 m-0 lg:mr-0 p-0 flex flex-row lg:flex-col items-start justify-center lg:justify-start space-x-4 lg:space-x-0 lg:space-y-4 pb-4 lg:pb-0">
          {/* 에디터 툴바 버튼들 */}
          <CircleIconButton 
            onClick={() => editor?.chain().focus().undo().run()} 
            aria-label="되돌리기" 
            className={`${loading || bubbleMenuLoading ? 'opacity-60 cursor-not-allowed' : ''} hover:bg-stone-200`}
            title="되돌리기 (Ctrl+Z)"
          >
            <ArrowUturnLeftIcon className="h-5 w-5 text-gray-700" />
          </CircleIconButton>
          <CircleIconButton 
            onClick={() => editor?.chain().focus().redo().run()} 
            aria-label="다시하기" 
            className={`${loading || bubbleMenuLoading ? 'opacity-60 cursor-not-allowed' : ''} hover:bg-stone-200`}
            title="다시하기 (Ctrl+Y)"
          >
            <ArrowUturnRightIcon className="h-5 w-5 text-gray-700" />
          </CircleIconButton>

          <div className="relative" onMouseEnter={() => setFontMenuOpen(true)} onMouseLeave={() => setFontMenuOpen(false)}>
            <CircleIconButton aria-label="글자 크기 조절" title="글자 크기 조절" className="hover:bg-stone-200">
              <span className="font-normal font-sans" style={{ fontSize: '1.25rem' }}>T</span>
            </CircleIconButton>
                                        {fontMenuOpen && (
                <div className="absolute right-full top-0 pr-2">
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-2">
                    <div className="flex flex-col gap-1">
                      {['small', 'normal', 'large', 'huge'].map((size) => (
                        <button
                          key={size}
                          onClick={() => {
                            applyFontSize(size)
                            setFontMenuOpen(false)
                        }}
                          className="px-3 py-1.5 hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 flex items-center gap-2 rounded"
                        >
                          <span className="font-normal font-sans" style={{ fontSize: size === 'small' ? '0.75rem' : size === 'normal' ? '1rem' : size === 'large' ? '1.25rem' : '1.5rem' }}>T</span>
                          <span className="capitalize">{size}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
          </div>
          
          <div className="relative" onMouseEnter={() => setColorMenuOpen(true)} onMouseLeave={() => setColorMenuOpen(false)}>
            <CircleIconButton aria-label="AI 하이라이트 색상 조절" title="AI 하이라이트 색상 조절" className="hover:bg-stone-200">
              <SparklesIcon className="h-5 w-5 text-stone-700" />
            </CircleIconButton>
            {colorMenuOpen && (
              <div className="absolute right-full top-0 pr-2">
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-2">
                  <div className="flex flex-col gap-1">
                    {highlightColors.map((color) => (
                      <button
                        key={color.name}
                        onClick={() => {
                          applyHighlightColor(color.name)
                          setColorMenuOpen(false)
                        }}
                        className="px-3 py-1.5 hover:bg-stone-50 transition-colors text-sm font-medium text-stone-700 flex items-center gap-2 rounded"
                      >
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: color.color }}
                        ></div>
                        <span className="capitalize">{color.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          

        </div>
        {/* 에디터 영역 */}
        <div className="flex-1 h-full lg:min-w-[500px] overflow-hidden lg:mx-3">
          <div className="w-full h-full flex flex-col overflow-y-auto p-4 text-lg bg-white border border-gray-300 rounded-lg scroll-smooth [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
          <div className="w-full flex flex-col">
            {/* 엔트리 타이틀 */}
            <TextInput 
              type='text' 
              className='w-full pt-4 text-3xl lg:text-4xl font-extrabold text-center border-none overflow-auto focus:outline-none focus:border-none focus:ring-0 focus:underline focus:underline-offset-4' 
              placeholder='제목' 
              value={title} 
              onChange={setTitle} 
            />
            <div className={`tiptap editor-wrapper w-full h-fit p-6 min-h-[30vh] max-h-[30vh] lg:min-h-[80vh] lg:max-h-none border-none overflow-y-auto lg:overflow-hidden antialiased focus:outline-none transition resize-none placeholder:text-muted ${namum.className} font-sans border-none relative ${(loading || bubbleMenuLoading || experienceButtonLoading) ? 'opacity-60 cursor-wait' : ''}`} style={{marginBottom: '30px' }}>
              <EditorContent editor={editor} />
              
              {/* BubbleMenu - 공식 React 컴포넌트 사용 */}
              {editor && (
                <BubbleMenu 
                  editor={editor} 
                  tippyOptions={{ 
                    duration: 100,
                    interactive: true,
                  }}
                  shouldShow={({ state }) => {
                    const { from, to } = state.selection
                    const selectedText = state.doc.textBetween(from, to).trim()
                    
                    // 모달이 열렸을 때는 버블 메뉴 숨기기
                    if (originalEntryModal.isOpen) {
                      return false
                    }
                    
                    // 텍스트가 선택되었고 500자 이하일 때만 표시
                    return from !== to && selectedText.length > 0 && selectedText.length < 500
                  }}
                >
                  <div className="flex items-center gap-1 rounded-xl shadow-2xl border border-stone-400 bg-black backdrop-blur-sm p-1.5">
                    {(experienceButtonLoading || bubbleMenuLoading) ? (
                      <div className="flex items-center justify-center px-6 py-2 text-sm font-bold text-white">
                        <div className="w-4 h-4 border-2 border-amber-300 border-t-stone-400 rounded-full animate-spin mr-2"></div>
                        생각 중...
                      </div>
                    ) : editor && editor.state.doc.textContent.length < 200 ? (
                      <div className="flex items-center justify-center px-6 py-2 text-sm font-medium text-amber-200">
                        충분히 작성한 뒤 다시 시도해주세요 (200자 이상)
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            handleExperienceRecall();
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-transparent hover:bg-gradient-to-r hover:from-amber-500/30 hover:to-orange-500/30 transition-all duration-300 text-base font-bold text-white hover:text-white hover:shadow-lg"
                          title="맞닿은 경험 찾기"
                        >
                          <LoaderIcon className="w-4 h-4" />
                          맞닿은 경험 찾기
                        </button>
                        <button
                          onClick={() => {
                            handleMeaningAugment();
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-transparent hover:bg-gradient-to-r hover:from-amber-500/30 hover:to-orange-500/30 transition-all duration-300 text-base font-bold text-white hover:text-white hover:shadow-lg"
                          title="의미 만들기"
                        >
                          <SparkleIcon className="w-4 h-4" />
                          의미 만들기
                        </button>
                      </>
                    )}
                  </div>
                </BubbleMenu>
              )}
              

            </div>
          </div>
        </div>
      </div>
      </div>
      {/* 오른쪽 패널: 의미찾기 결과 */}
      <aside className={`flex-1 max-w-full lg:max-w-sm min-w-0 flex flex-col h-fit px-0 pb-4 overflow-visible order-3 lg:order-3 ${
        (bubbleMenuOptions || augmentOptions) && augmentVisible && !augmentCollapsed ? 'lg:h-full lg:overflow-hidden' : 'lg:overflow-visible'
      }`}>
        <div className={`px-0 lg:px-3 lg:pb-10 space-y-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 ${
          (bubbleMenuOptions || augmentOptions) && augmentVisible && !augmentCollapsed ? 'lg:flex-1 lg:overflow-y-auto' : ''
        }`}>
          {/* <Button onClick={handleAugment} disabled={loading} className="px-4 py-2 rounded">
            {loading ? '고민하는 중...' : '의미 만들기'}
          </Button> */}
          {/* 증강 옵션 */}
          {(bubbleMenuOptions || augmentOptions) && augmentVisible && (
            <div id='augment-result' className="bg-[#f5f4ed] border border-stone-300 rounded-lg shadow-md p-3 mb-4 relative">
              {/* 로딩 중일 때 오버레이 (자체 로딩만) */}
              {bubbleMenuLoading && (
                <div className="absolute inset-0 bg-gray-300 bg-opacity-50 rounded-lg z-10 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button 
                    className={`p-2 hover:bg-stone-200 rounded-lg transition-colors flex items-center justify-center ${(bubbleMenuLoading || experienceButtonLoading) ? 'pointer-events-none' : ''}`}
                    onClick={() => setAugmentCollapsed(!augmentCollapsed)}
                    title={augmentCollapsed ? "펼치기" : "접기"}
                    disabled={bubbleMenuLoading || experienceButtonLoading}
                  >
                    {augmentCollapsed ? (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-gray-500" />
                    )}
                  </button>
                  <span className="font-bold text-l text-stone-800">의미 만들기</span>
                </div>
                <button
                  type="button"
                  aria-label="닫기"
                  className={`w-8 h-8 p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded-lg transition-colors flex items-center justify-center ${(bubbleMenuLoading || experienceButtonLoading) ? 'pointer-events-none' : ''}`}
                  onClick={() => setAugmentVisible(false)}
                  disabled={bubbleMenuLoading || experienceButtonLoading}
                >
                  <span className="text-lg font-bold">×</span>
                </button>
              </div>
              <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
                augmentCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
              }`}>
                <div className="text-stone-600 text-sm my-3">
                어떤 방향으로 생각해 볼까요?<br/>
                자신의 마음과 각 내용을 비교해 보고, 마음에 드는 것이 있다면 선택해서 생각을 이어 나갈 수 있습니다.
                </div>
                {(bubbleMenuOptions || augmentOptions) && (() => {
                  const options = bubbleMenuOptions || augmentOptions;
                  if (!options) return null;
                  
                  const optionsArray = [
                    { ...options.option1, index: 0 },
                    { ...options.option2, index: 1 },
                    { ...options.option3, index: 2 }
                  ];
                  
                  return optionsArray.map((option) => (
                    <button
                      key={option.index}
                      onClick={() => applyAugmentation(option.text, option)}
                      className={`w-full text-left bg-white border border-stone-300 rounded-lg p-4 mb-2 hover:bg-stone-50 transition ${(bubbleMenuLoading || experienceButtonLoading) ? 'pointer-events-none' : ''}`}
                      disabled={bubbleMenuLoading || experienceButtonLoading}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-l text-gray-900">{option.title || `생각 ${option.index + 1}`}</span>
                      </div>
                      {/* {option.strategy && (
                        <div className="text-gray-500 text-xs mb-2 italic">
                          {option.strategy}
                        </div>
                      )} */}
                      <div className="text-gray-800 text-[15px] leading-relaxed">
                        {option.text}
                      </div>
                    </button>
                  ));
                })()}
              </div>
            </div>
          )}
          {/* 추가된 문장 */}
          {/* 
          {augments.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <CheckIcon className="h-4 w-4 text-gray-600" />
                  <h3 className="text-gray-800 font-medium text-sm">추가된 표현</h3>
                  <span className="ml-auto bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-md">
                    {augments.length}개
                  </span>
                </div>
              </div>
              <div className="p-3 space-y-2">
                {augments.map((a, i) => (
                  <div key={i} className="bg-gray-50 border border-gray-200 rounded-md p-3 hover:bg-white transition-colors duration-150">
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-medium">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-700 text-sm leading-relaxed italic">
                          {a.inserted}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-200 text-gray-700">
                            {a.category}
                          </span>
                          <span className="text-xs text-gray-400 font-mono">
                            {a.requestId.slice(-6)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )} */}
        </div>
      </aside>
      
      {/* 원본 일기 모달 */}
      <JournalModal
        isOpen={originalEntryModal.isOpen}
        onClose={() => setOriginalEntryModal(prev => ({ ...prev, isOpen: false }))}
        title={originalEntryModal.title}
        content={originalEntryModal.content}
        createdAt={originalEntryModal.createdAt}
        loading={originalEntryModal.loading}
      />
    </div>
  )
}
