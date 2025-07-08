import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
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
    canLog 
  } = useInteractionLog()

  // 세션 정보 가져오기
  const { user } = useSession()

  // 로깅 상태 확인
  const canLogState = canLog && entryId

  // 변화 감지용 ref (필요한 것만 유지)
  const lastReceiveAI = useRef<string>('')

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
  const aiTextEditTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    const options = bubbleMenuOptions || augmentOptions
    if (options && canLogState) {
      // 중복 체크를 위한 문자열 생성
      const optionsString = JSON.stringify(options)
      if (lastReceiveAI.current !== optionsString) {
        logAIReceive(entryId, options)
        lastReceiveAI.current = optionsString
      }
    }
  }, [bubbleMenuOptions, augmentOptions, canLogState, entryId, logAIReceive])

  const editor = useEditor({
    extensions: [
      StarterKit,
      AIHighlight,
      Placeholder.configure({
        placeholder: '무엇이든 자유롭게 적어보세요',
        emptyEditorClass: 'is-editor-empty',
      }),
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
      }, 100)
    },
    onSelectionUpdate: ({ editor }: { editor: any }) => {
      // 텍스트 선택 로깅 제거됨
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

  // 기본 AI 하이라이트 색상 설정 (기본 초록색으로 설정)
  useEffect(() => {
    // 기본 초록색 배경으로 설정
    document.documentElement.style.setProperty('--ai-highlight-bg', 'rgba(207, 255, 204, 1)')
  }, [])

  // AI 요청 상태에 따라 에디터 편집 가능 상태 업데이트
  useEffect(() => {
    if (editor) {
      editor.setEditable(!loading && !bubbleMenuLoading && !experienceButtonLoading)
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
      
      setExperienceOptions({
        selectedText: selectedText,
        experiences: data.data.experiences || []
      })
    } catch (error) {
      console.error('Error fetching experience options:', error)
      alert('경험 관련 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setExperienceButtonLoading(false)
    }
  }, [experienceButtonLoading, editor, user])

  // 원본 일기 가져오기 함수
  const handleViewOriginalEntry = useCallback(async (entryId: string) => {
    if (!user || !user.participant_code) {
      alert('로그인 정보가 없습니다.')
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

      const response = await fetch('/api/entries/list', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('일기 목록을 가져오는 데 실패했습니다.')
      }

      const data = await response.json()
      const entry = data.data.entries.find((e: any) => e.id === entryId)
      
      if (!entry) {
        throw new Error('해당 일기를 찾을 수 없습니다.')
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
      alert(error instanceof Error ? error.message : '일기를 불러오는 데 실패했습니다.')
      setOriginalEntryModal(prev => ({ ...prev, loading: false, isOpen: false }))
    }
  }, [user])

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
    if (canLogState) {
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
    } catch (error) {
      console.error('Error fetching augment options:', error)
      alert('AI 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setBubbleMenuLoading(false)
    }
  }, [bubbleMenuLoading, editor, userInfo, canLogState, entryId, logAITrigger, user])

  // AI 텍스트 편집 감지 및 투명도 업데이트 (직접 스타일 적용)
  const handleAITextEdit = useCallback(() => {
    if (!editor) return

    // DOM에서 모든 AI 텍스트 요소 찾기
    const editorElement = editor.view.dom as HTMLElement
    const aiElements = editorElement.querySelectorAll('mark[ai-text]')
    
    // 각 AI 요소에 대해 수정 정도 계산 및 직접 스타일 적용
    aiElements.forEach((element, index) => {
      const currentText = element.textContent || ''
      const originalText = element.getAttribute('data-original') // DOM에서는 하이픈 사용
      
      // data-original이 있는 경우에만 투명도 계산 (AI 텍스트만)
      if (originalText) {
        const editRatio = calculateEditRatio(originalText, currentText)
        
        // Tiptap 명령어를 사용하여 editRatio 속성 업데이트
        const htmlElement = element as HTMLElement
        const requestId = htmlElement.getAttribute('request-id') // DOM에서는 하이픈 사용
        const category = htmlElement.getAttribute('category') as AICategory || 'interpretive' // DOM에서는 하이픈 사용
        
        // 현재 선택 범위를 저장
        const currentSelection = editor.state.selection
        
        // 해당 요소를 찾아서 마크 업데이트
        const { from, to } = editor.state.selection
        const doc = editor.state.doc
        
        // 문서 전체를 순회하면서 해당 텍스트를 찾아 마크 업데이트
        doc.descendants((node, pos) => {
          if (node.isText && node.text === currentText) {
            // 해당 위치에 마크가 있는지 확인
            const marks = editor.state.doc.nodeAt(pos)?.marks || []
            const aiMark = marks.find(mark => mark.type.name === 'aiHighlight')
            
            if (aiMark) {
              // 마크 업데이트
              editor.chain()
                .focus()
                .setTextSelection({ from: pos, to: pos + currentText.length })
                .setMark('aiHighlight', {
                  requestId: requestId || 'unknown',
                  category,
                  dataOriginal: originalText,
                  editRatio: editRatio.toString()
                })
                .run()
              
              // 원래 선택 범위 복원
              editor.chain().focus().setTextSelection(currentSelection).run()
            }
          }
        })
      }
    })

    // 마크 업데이트 후 현재 선택된 색상 다시 적용
    setTimeout(() => {
      const currentBgColor = getComputedStyle(document.documentElement).getPropertyValue('--ai-highlight-bg')
      if (currentBgColor) {
        const editorElement = editor.view.dom as HTMLElement
        const aiElements = editorElement.querySelectorAll('mark[ai-text]')
        aiElements.forEach((element) => {
          const htmlElement = element as HTMLElement
          const editRatio = parseFloat(htmlElement.getAttribute('edit-ratio') || '0')
          const opacity = Math.max(0, 1 - editRatio)
          
          // 현재 선택된 색상으로 배경색 업데이트
          const backgroundColor = opacity > 0 
            ? currentBgColor.replace('1)', `${opacity})`) 
            : 'transparent'
          
          htmlElement.style.backgroundColor = backgroundColor
        })
      }
    }, 50)
  }, [editor])

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

  // AI 하이라이트 색상 옵션들
  const highlightColors = [
    { name: 'blue', color: '#D2FBFF', bgColor: 'rgba(210, 251, 255, 1)' },
    { name: 'green', color: '#CFFFCC', bgColor: 'rgba(207, 255, 204, 1)' },
    { name: 'purple', color: '#F2E7FF', bgColor: 'rgba(242, 231, 255, 1)' },
    { name: 'pink', color: '#FFE7EF', bgColor: 'rgba(255, 231, 239, 1)' },
    { name: 'yellow', color: '#FFFEA7', bgColor: 'rgba(255, 254,167, 1)' },
  ]

  const applyHighlightColor = (colorName: string) => {
    const selectedColor = highlightColors.find(c => c.name === colorName)
    if (selectedColor) {
      // CSS 변수로 배경색 설정
      document.documentElement.style.setProperty('--ai-highlight-bg', selectedColor.bgColor)
      
      // 기존 AI 텍스트들의 배경색 업데이트 (투명도 유지)
      if (editor) {
        const editorElement = editor.view.dom as HTMLElement
        const aiElements = editorElement.querySelectorAll('mark[ai-text]')
        aiElements.forEach((element) => {
          const htmlElement = element as HTMLElement
          const editRatio = parseFloat(htmlElement.getAttribute('edit-ratio') || '0')
          const opacity = Math.max(0, 1 - editRatio)
          
          // 투명도 적용된 배경색 계산
          const backgroundColor = opacity > 0 
            ? selectedColor.bgColor.replace('1)', `${opacity})`) 
            : 'transparent'
          
          htmlElement.style.backgroundColor = backgroundColor
        })
      }
    }
  }

  // 저장 함수 (부모 컴포넌트에 위임)
  const handleSave = () => {
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
    if (canLogState) {
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
    if (canLogState) {
      logAITextInsert(entryId, selectedOption || inserted);
    }

    // 하나의 트랜잭션으로 텍스트 삽입과 마크 적용을 동시에 실행
    editor.chain()
      .focus()
      .setTextSelection(to)
      .insertContent(inserted)
      .setTextSelection({ from: to, to: to + inserted.length })
      .setMark('aiHighlight', {
        requestId: finalRequestId,
        category,
        dataOriginal: inserted,
        editRatio: '0'
      })
      .run();

    // DOM 속성 설정 및 현재 선택된 색상 적용 (히스토리에 영향을 주지 않음)
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
        
        // 현재 선택된 색상 적용
        const currentBgColor = getComputedStyle(document.documentElement).getPropertyValue('--ai-highlight-bg')
        if (currentBgColor) {
          const editRatio = parseFloat(lastElement.getAttribute('edit-ratio') || '0')
          const opacity = Math.max(0, 1 - editRatio)
          
          // 새로 삽입된 AI 텍스트에 현재 선택된 색상 적용
          const backgroundColor = opacity > 0 
            ? currentBgColor.replace('1)', `${opacity})`) 
            : 'transparent'
          
          lastElement.style.backgroundColor = backgroundColor
        }
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
    <div className="flex flex-row h-screen w-full overflow-hidden bg-gray-50">
      {/* 왼쪽 패널: 경험 떠올리기 결과 */}
      <div className="flex-1 max-w-sm min-w-0 hidden md:flex flex-col h-full pb-20 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 space-y-4">
        {/* 경험 관련 결과 */}
        {experienceOptions && experienceVisible && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-2 mb-4 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button 
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center"
                  onClick={() => setExperienceCollapsed(!experienceCollapsed)}
                  title={experienceCollapsed ? "펼치기" : "접기"}
                >
                  {experienceCollapsed ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  )}
                </button>
                <span className="font-bold text-l text-gray-900">관련 경험 살펴보기</span>
              </div>
              <button
                type="button"
                aria-label="닫기"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center"
                onClick={() => setExperienceVisible(false)}
              >
                <span className="text-lg font-bold">×</span>
              </button>
            </div>
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
              experienceCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
            }`}>
              <div className="text-gray-500 text-sm mx-2 mb-3">
                어떤 기억이 떠오르시나요?
              </div>
              {experienceOptions && experienceOptions.experiences && experienceOptions.experiences.length > 0 ? (
                experienceOptions.experiences.map((experience: any, index: number) => (
                  <div
                    key={experience.id || index}
                    className="w-full bg-white border border-gray-100 rounded-lg p-4 mx-2 mb-2"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-l text-gray-900">{experience.strategy || '과거 경험 떠올려보기'}</span>
                    </div>
                    <div className="text-gray-800 text-[15px] leading-relaxed mb-3">
                      {experience.description || '관련된 과거 경험이 있습니다.'}
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
                    
                    {/* 원본 보기 버튼 */}
                    <button
                      onClick={() => {
                        handleViewOriginalEntry(experience.id)
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 mt-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors duration-200"
                    >
                      <span className="text-sm font-medium text-gray-700 truncate">
                        {experience.title || '무제'}
                      </span>
                      <ExternalLink className="w-4 h-4 text-gray-500 flex-shrink-0 ml-2" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-gray-400 text-sm text-center py-4">
                  경험 관련 결과가 없습니다
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
      {/* 중앙 패널: 에디터 영역 */}
      <div className="flex-1 min-w-0 hidden md:flex flex-row h-full">
        {/* 에디터 툴바 */}
        <div className="flex-shrink-0 m-0 mr-4 p-0 flex flex-col items-center space-y-4">
          {/* 에디터 툴바 버튼들 */}
          <CircleIconButton 
            onClick={() => editor?.chain().focus().undo().run()} 
            aria-label="되돌리기" 
            className={`${loading || bubbleMenuLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
            title="되돌리기 (Ctrl+Z)"
          >
            <ArrowUturnLeftIcon className="h-5 w-5 text-gray-700" />
          </CircleIconButton>
          <CircleIconButton 
            onClick={() => editor?.chain().focus().redo().run()} 
            aria-label="다시하기" 
            className={`${loading || bubbleMenuLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
            title="다시하기 (Ctrl+Y)"
          >
            <ArrowUturnRightIcon className="h-5 w-5 text-gray-700" />
          </CircleIconButton>

          <div className="relative" onMouseEnter={() => setFontMenuOpen(true)} onMouseLeave={() => setFontMenuOpen(false)}>
            <CircleIconButton aria-label="글자 크기 조절" title="글자 크기 조절">
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
            <CircleIconButton aria-label="AI 하이라이트 색상 조절" title="AI 하이라이트 색상 조절">
              <SparklesIcon className="h-5 w-5 text-gray-700" />
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
                        className="px-3 py-1.5 hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 flex items-center gap-2 rounded"
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
          
          <CircleIconButton 
            onClick={handleSave} 
            aria-label="저장하기" 
            title="저장하기 (Ctrl+S)"
          >
            <ArchiveBoxIcon className="h-5 w-5 text-gray-700" />
          </CircleIconButton>
        </div>
        {/* 에디터 영역 */}
        <div className="flex-1 h-full overflow-hidden">
          <div className="tiptap-scrollbar w-full h-full flex flex-col overflow-y-auto p-4 text-lg bg-white border border-gray-300 rounded-lg scroll-smooth">
          <div className="w-full flex flex-col">
            {/* 엔트리 타이틀 */}
            <TextInput 
              type='text' 
              className='w-full pt-4 text-4xl font-extrabold text-center border-none overflow-auto focus:outline-none focus:border-none focus:ring-0 focus:underline focus:underline-offset-4' 
              placeholder='제목' 
              value={title} 
              onChange={setTitle} 
            />
            <div className={`tiptap editor-wrapper w-full h-fit p-6 min-h-[60vh] border-none overflow-hidden max-h-none antialiased focus:outline-none transition resize-none placeholder:text-muted ${namum.className} font-sans border-none relative ${(loading || bubbleMenuLoading || experienceButtonLoading) ? 'opacity-60 cursor-wait' : ''}`} style={{marginBottom: '30px' }}>
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
                    
                    // 텍스트가 선택되었고 500자 이하일 때만 표시
                    return from !== to && selectedText.length > 0 && selectedText.length < 500
                  }}
                >
                  <div className="flex items-center gap-1 rounded-xl shadow-2xl border border-stone-400 bg-black backdrop-blur-sm p-1.5">
                    {(experienceButtonLoading || bubbleMenuLoading) ? (
                      <div className="flex items-center justify-center px-6 py-2 text-sm font-bold">
                        <div className="w-4 h-4 border-2 border-amber-300 border-t-stone-400 rounded-full animate-spin mr-2"></div>
                        생각 중...
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            handleExperienceRecall();
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-transparent hover:bg-gradient-to-r hover:from-amber-500/30 hover:to-orange-500/30 transition-all duration-300 text-base font-bold text-white hover:text-white hover:shadow-lg"
                          title="관련 경험 떠올리기"
                        >
                          <LoaderIcon className="w-4 h-4" />
                          경험떠올리기
                        </button>
                        <button
                          onClick={() => {
                            handleMeaningAugment();
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-transparent hover:bg-gradient-to-r hover:from-amber-500/30 hover:to-orange-500/30 transition-all duration-300 text-base font-bold text-white hover:text-white hover:shadow-lg"
                          title="의미 찾기"
                        >
                          <SparkleIcon className="w-4 h-4" />
                          의미찾기
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
      <aside className="flex-1 max-w-sm min-w-0 hidden md:flex flex-col h-full pb-20 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 space-y-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
          {/* <Button onClick={handleAugment} disabled={loading} className="px-4 py-2 rounded">
            {loading ? '고민하는 중...' : '의미 찾기'}
          </Button> */}
          {/* 증강 옵션 */}
          {(bubbleMenuOptions || augmentOptions) && augmentVisible && (
            <div id='augment-result' className="bg-white border border-gray-200 rounded-lg shadow-sm p-2 mb-4 relative">
                          <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button 
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center"
                  onClick={() => setAugmentCollapsed(!augmentCollapsed)}
                  title={augmentCollapsed ? "펼치기" : "접기"}
                >
                  {augmentCollapsed ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  )}
                </button>
                <span className="font-bold text-l text-gray-900">의미 찾기</span>
              </div>
              <button
                type="button"
                aria-label="닫기"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center"
                onClick={() => setAugmentVisible(false)}
              >
                <span className="text-lg font-bold">×</span>
              </button>
            </div>
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
              augmentCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
            }`}>
              <div className="text-gray-500 text-sm mx-2 mb-3">
                어떻게 생각해볼까요?
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
                    className="w-full text-left bg-white border border-gray-100 rounded-lg p-4 mx-2 mb-2 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-l text-gray-900">{option.title || `생각 ${option.index + 1}`}</span>
                    </div>
                    {option.strategy && (
                      <div className="text-gray-500 text-xs mb-2 italic">
                        {option.strategy}
                      </div>
                    )}
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
