import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { AIHighlight } from '../utils/tiptapExtensions'
import { Button, Heading, Card, Textarea, TextInput } from './index'
import { ArrowUturnLeftIcon, ArrowUturnRightIcon, ArchiveBoxIcon, DocumentTextIcon, SparklesIcon, BoldIcon, ItalicIcon, CommandLineIcon, LinkIcon } from "@heroicons/react/24/outline";
import CircleIconButton from './CircleIconButton';
import { Nanum_Myeongjo } from 'next/font/google'
import { 
  generateRequestId, 
  findAITextElement, 
  createAITextAttributes,
  calculateBackgroundOpacity,
  getBackgroundColor,
  debounce
} from '../utils/editorHelpers'
import { calculateEditCount, calculateEditRatio } from '../utils/diff'
import type { AICategory } from '../types/ai'
import { useInteractionLog } from '../hooks/useInteractionLog'

const namum = Nanum_Myeongjo({
    subsets: ['latin'],
    weight: ['400', '700', '800'],
  })

export default function Editor({ 
  userId, 
  entryId,
  onTitleChange, 
  onContentChange 
}: { 
  userId: string
  entryId: string
  onTitleChange?: (title: string) => void
  onContentChange?: (content: string) => void
}) {
  const [editorContent, setEditorContent] = useState('');
  const [title, setTitle] = useState('')
  const [previousContent, setPreviousContent] = useState('')
  
  // 인터랙션 로그 훅 사용
  const { 
    logTextSelection, 
    logTextDeselection, 
    logAITrigger, 
    logAIReceive, 
    logAITextInsert, 
    logAITextEdit,
    logManualTextEdit,
    canLog 
  } = useInteractionLog()

  // 변화 감지용 ref
  const lastSelectedText = useRef<string>('')
  const lastManualEdit = useRef<string>('')
  const lastAIEdit = useRef<{original: string, edited: string}>({original: '', edited: ''})

  // Debounce 적용 (manual edit, select_text, edit_ai_text)
  const debouncedManualEditLog = useRef(debounce((entryId: string, prev: string, curr: string) => {
    if (canLog && entryId && prev !== curr) {
      logManualTextEdit(entryId, prev, curr)
      lastManualEdit.current = curr
    }
  }, 1000)).current

  const debouncedSelectTextLog = useRef(debounce((entryId: string, text: string) => {
    if (canLog && entryId && lastSelectedText.current !== text) {
      logTextSelection(entryId, text)
      lastSelectedText.current = text
    }
  }, 500)).current

  const debouncedAIEditLog = useRef(debounce((entryId: string, original: string, edited: string) => {
    if (canLog && entryId && original !== edited && (lastAIEdit.current.original !== original || lastAIEdit.current.edited !== edited)) {
      logAITextEdit(entryId, original, edited)
      lastAIEdit.current = {original, edited}
    }
  }, 1000)).current

  // 제목 변경 시 외부로 알림
  useEffect(() => {
    if (onTitleChange) {
      onTitleChange(title)
    }
  }, [title, onTitleChange])
  const [augments, setAugments] = useState<{ start: number; end: number; inserted: string; requestId: string; category: AICategory; originalText: string }[]>([])
  const [beliefSummary, setBeliefSummary] = useState('')
  const [augmentOptions, setAugmentOptions] = useState<string[] | null>(null)
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number; requestId?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [fontMenuOpen, setFontMenuOpen] = useState(false)
  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const [bubbleMenuLoading, setBubbleMenuLoading] = useState(false)
  const [bubbleMenuOptions, setBubbleMenuOptions] = useState<string[] | null>(null)
  const [bubbleMenuPosition, setBubbleMenuPosition] = useState<{ from: number; to: number } | null>(null)
  
  // 디바운스용 ref
  const aiTextEditTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // receive_ai 로그: 옵션이 처음 세팅될 때 1회만 기록
  const lastReceiveAI = useRef<string>('')
  useEffect(() => {
    const options = bubbleMenuOptions || augmentOptions
    if (options && options.length > 0 && canLog && entryId) {
      // 같은 옵션이 반복적으로 세팅될 때 중복 기록 방지
      if (lastReceiveAI.current !== options[0]) {
        logAIReceive(entryId, options[0])
        lastReceiveAI.current = options[0]
      }
    }
  }, [bubbleMenuOptions, augmentOptions, canLog, entryId, logAIReceive])

  const editor = useEditor({
    extensions: [
      StarterKit,
      AIHighlight,
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none leading-loose',
      },
    },
    onUpdate: ({ editor }: { editor: any }) => {
      const content = editor.getHTML()
      setEditorContent(content)
      if (onContentChange) {
        onContentChange(content)
      }
      // manual edit: debounce + 변화 감지
      if (previousContent && content !== previousContent && canLog && entryId) {
        debouncedManualEditLog(entryId, previousContent, content)
      }
      setPreviousContent(content)
      
      // AI 텍스트 편집 감지 (디바운스 적용)
      if (aiTextEditTimeoutRef.current) {
        clearTimeout(aiTextEditTimeoutRef.current)
      }
      aiTextEditTimeoutRef.current = setTimeout(() => {
        handleAITextEdit()
      }, 100)
    },
    onSelectionUpdate: ({ editor }: { editor: any }) => {
      const { from, to } = editor.state.selection
      if (from !== to && canLog && entryId) {
        const selectedText = editor.state.doc.textBetween(from, to).trim()
        if (selectedText) {
          debouncedSelectTextLog(entryId, selectedText)
        }
      } else if (canLog && entryId) {
        // logTextDeselection(entryId) 호출 제거, deselect_text는 더 이상 기록하지 않음
        lastSelectedText.current = ''
      }
    },
  })

  // 사용자 프로필 가져오기
  useEffect(() => {
    const fetchBelief = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('profile')
        .eq('id', userId)
        .single()
      if (!error && data?.profile) {
        setBeliefSummary(data.profile)
      }
    }
    if (userId) fetchBelief()
  }, [userId])

  // 기본 AI 하이라이트 색상 설정
  useEffect(() => {
    // 기본 파란색 배경으로 설정
    document.documentElement.style.setProperty('--ai-highlight-bg', 'rgba(219, 234, 254, 1)')
  }, [])

  // BubbleMenu용 AI API 호출 함수 (useCallback으로 메모이제이션)
  const handleBubbleMenuAugment = useCallback(async () => {
    if (bubbleMenuLoading || !editor) return

    const { from, to } = editor.state.selection
    if (from === to) return

    const selectedText = editor.state.doc.textBetween(from, to).trim()
    if (!selectedText) return

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
          userProfile: beliefSummary,
        }),
      })
      const data = await res.json()
      if (data.interpretiveAgentResult) {
        setBubbleMenuOptions([
          data.interpretiveAgentResult.option1,
          data.interpretiveAgentResult.option2,
          data.interpretiveAgentResult.option3,
        ])
      }
    } catch (error) {
      console.error('Error fetching bubble menu augment options:', error)
    } finally {
      setBubbleMenuLoading(false)
    }
  }, [bubbleMenuLoading, editor, beliefSummary])

  // AI 텍스트 편집 감지 및 투명도 업데이트 (직접 스타일 적용)
  const handleAITextEdit = useCallback(() => {
    if (!editor) return
    const editorElement = editor.view.dom as HTMLElement
    const aiElements = editorElement.querySelectorAll('mark[ai-text]')
    aiElements.forEach((element) => {
      const currentText = element.textContent || ''
      const originalText = element.getAttribute('data-original')
      if (originalText) {
        const editRatio = calculateEditRatio(originalText, currentText)
        // AI 텍스트 편집 로그 (실제 변화 + debounce)
        debouncedAIEditLog(entryId, originalText, currentText)
        
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
      } else {
        console.log(`❌ 원본 텍스트가 없음: data-original 속성 확인 필요`)
      }
    })
  }, [editor, entryId, canLog])

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
    { name: 'blue', color: '#3B82F6', bgColor: 'rgba(219, 234, 254, 1)' },
    { name: 'green', color: '#10B981', bgColor: 'rgba(209, 250, 229, 1)' },
    { name: 'purple', color: '#8B5CF6', bgColor: 'rgba(237, 233, 254, 1)' },
    { name: 'pink', color: '#EC4899', bgColor: 'rgba(252, 231, 243, 1)' },
    { name: 'yellow', color: '#EAB308', bgColor: 'rgba(254, 249, 195, 1)' },
  ]

  const applyHighlightColor = (colorName: string) => {
    const selectedColor = highlightColors.find(c => c.name === colorName)
    if (selectedColor) {
      // CSS 변수로 배경색 설정 (AIHighlight 확장에서 사용)
      document.documentElement.style.setProperty('--ai-highlight-bg', selectedColor.bgColor)
      
      // 기존 AI 텍스트들의 배경색 업데이트 (투명도 유지)
      if (editor) {
        const editorElement = editor.view.dom as HTMLElement
        const aiElements = editorElement.querySelectorAll('mark[ai-text]')
        aiElements.forEach((element) => {
          const htmlElement = element as HTMLElement
          const editRatio = parseFloat(htmlElement.getAttribute('edit-ratio') || '0')
          const opacity = Math.max(0, 1 - editRatio) // 수정이 많을수록 투명도가 낮아짐
          
          // 투명도 적용된 배경색 계산
          const backgroundColor = opacity > 0 
            ? selectedColor.bgColor.replace('1)', `${opacity})`) 
            : 'transparent'
          
          htmlElement.style.backgroundColor = backgroundColor
        })
      }
    }
  }

  const handleAugment = async () => {
    if (loading || !editor) return

    const { from, to } = editor.state.selection
    if (from === to) return alert('텍스트를 선택하세요.')

    const selectedText = editor.state.doc.textBetween(from, to).trim()
    if (!selectedText) return alert('텍스트를 선택하세요.')

    // AI 호출 로그
    if (canLog && entryId) {
      logAITrigger(entryId, selectedText)
    }

    setLoading(true)
    setSelectionRange({ start: from, end: to })
    
    const fullText = editor.state.doc.textContent
    const diaryEntryMarked = fullText.slice(0, to) + ' <<INSERT HERE>> ' + fullText.slice(to)

    try {
      const res = await fetch('/api/augment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          diaryEntry: fullText,
          diaryEntryMarked: diaryEntryMarked,
          userProfile: beliefSummary,
        }),
      })
      const data = await res.json()
      if (data.interpretiveAgentResult) {
        // AI 응답 수신 로그
        if (canLog && entryId) {
          logAIReceive(entryId, data.interpretiveAgentResult.option1)
        }
        
        // API 응답에서 request ID 저장
        setAugmentOptions([
          data.interpretiveAgentResult.option1,
          data.interpretiveAgentResult.option2,
          data.interpretiveAgentResult.option3,
        ])
        // Request ID를 selectionRange에 저장 (나중에 사용)
        setSelectionRange(prev => prev ? { ...prev, requestId: data.requestId } : null)
      }
    } catch (error) {
      console.error('Error fetching augment options:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyAugmentation = (inserted: string) => {
    if (!selectionRange || !editor) return
    const { end, requestId } = selectionRange

    // API에서 받은 request ID 사용, 없으면 새로 생성
    const finalRequestId = requestId || generateRequestId()
    const category: AICategory = 'interpretive'

    // AI 텍스트 삽입 로그
    if (canLog && entryId) {
      logAITextInsert(entryId, inserted)
    }

    // 하나의 트랜잭션으로 텍스트 삽입과 마크 적용을 동시에 실행
    editor.chain()
      .focus()
      .setTextSelection(end)
      .insertContent(inserted)
      .setTextSelection({ from: end, to: end + inserted.length })
      .setMark('aiHighlight', {
        requestId: finalRequestId,
        category,
        dataOriginal: inserted,
        editRatio: '0'
      })
      .run()
    
    // DOM 속성 설정 (히스토리에 영향을 주지 않음)
    setTimeout(() => {
      const editorElement = editor.view.dom as HTMLElement
      const aiElements = editorElement.querySelectorAll('mark[ai-text]')
      const lastElement = aiElements[aiElements.length - 1] as HTMLElement
      
      if (lastElement) {
        const dataOriginal = lastElement.getAttribute('data-original') // DOM에서는 하이픈 사용
        
        // data-original이 없으면 수동으로 설정
        if (!dataOriginal) {
          lastElement.setAttribute('data-original', inserted) // DOM에서는 하이픈 사용
          lastElement.setAttribute('request-id', finalRequestId) // DOM에서는 하이픈 사용
          lastElement.setAttribute('category', category) // DOM에서는 하이픈 사용
        }
      }
    }, 50)

    setAugments((prev) => [...prev, { 
      start: end, 
      end: end + inserted.length, 
      inserted,
      requestId: finalRequestId,
      category,
      originalText: inserted
    }])
    setAugmentOptions(null)
    setSelectionRange(null)
  }

  // BubbleMenu용 증강 적용 함수 (AI 삽입 로그 보장)
  const applyBubbleMenuAugmentation = (inserted: string) => {
    if (!bubbleMenuPosition || !editor) return
    const { to } = bubbleMenuPosition
    const finalRequestId = generateRequestId()
    const category: AICategory = 'interpretive'
    // AI 텍스트 삽입 로그 (BubbleMenu 경로에서도 보장)
    if (canLog && entryId) {
      logAITextInsert(entryId, inserted)
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
      .run()
    
    // DOM 속성 설정 (히스토리에 영향을 주지 않음)
    setTimeout(() => {
      const editorElement = editor.view.dom as HTMLElement
      const aiElements = editorElement.querySelectorAll('mark[ai-text]')
      const lastElement = aiElements[aiElements.length - 1] as HTMLElement
      
      if (lastElement) {
        const dataOriginal = lastElement.getAttribute('data-original')
        
        if (!dataOriginal) {
          lastElement.setAttribute('data-original', inserted)
          lastElement.setAttribute('request-id', finalRequestId)
          lastElement.setAttribute('category', category)
        }
      }
    }, 50)

    setAugments((prev) => [...prev, { 
      start: to, 
      end: to + inserted.length, 
      inserted,
      requestId: finalRequestId,
      category,
      originalText: inserted
    }])
    setBubbleMenuOptions(null)
    setBubbleMenuPosition(null)
  }

  return (
    <div className="flex flex-row h-full w-full overflow-hidden">
      {/* 왼쪽 버튼 패널 */}
      <div className="hidden md:flex md:w-64 border-r flex-shrink-0 flex-col justify-start p-4 space-y-2 items-end space-y-4">
        
        <div className="relative" onMouseEnter={() => setFontMenuOpen(true)} onMouseLeave={() => setFontMenuOpen(false)}>
          <CircleIconButton aria-label="글자 크기 조절">
            <span className="font-normal font-sans" style={{ fontSize: '1.25rem' }}>T</span>
          </CircleIconButton>
          {fontMenuOpen && (
            <div className="absolute right-full top-1/2 -translate-y-1/2 flex gap-2 bg-transparent z-10 text-sm px-2 py-1">
              {['small', 'normal', 'large', 'huge'].map((size) => (
                <CircleIconButton
                  key={size}
                  onClick={() => {
                    applyFontSize(size)
                    setFontMenuOpen(false)
                }}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                >
                  <span className="font-normal font-sans" style={{ fontSize: size === 'small' ? '0.75rem' : size === 'normal' ? '1rem' : size === 'large' ? '1.25rem' : '1.5rem' }}>T</span>
                </CircleIconButton>
              ))}
            </div>
          )}
        </div>
        
        <div className="relative" onMouseEnter={() => setColorMenuOpen(true)} onMouseLeave={() => setColorMenuOpen(false)}>
          <CircleIconButton aria-label="AI 하이라이트 색상 조절">
            <SparklesIcon className="h-5 w-5 text-gray-700" />
          </CircleIconButton>
          {colorMenuOpen && (
            <div className="absolute right-full top-1/2 -translate-y-1/2 flex gap-2 bg-transparent z-10 text-sm px-2 py-1">
              {highlightColors.map((color) => (
                <CircleIconButton
                  key={color.name}
                  onClick={() => {
                    applyHighlightColor(color.name)
                    setColorMenuOpen(false)
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-gray-200 hover:border-gray-300"
                >
                  <div 
                    className="w-4 h-4 rounded-full" 
                    style={{ backgroundColor: color.color }}
                  ></div>
                </CircleIconButton>
              ))}
            </div>
          )}
        </div>
        
        <CircleIconButton onClick={() => editor?.chain().focus().undo().run()} aria-label="되돌리기" >
          <ArrowUturnLeftIcon className="h-5 w-5 text-gray-700" />
        </CircleIconButton>
        <CircleIconButton onClick={() => editor?.chain().focus().redo().run()} aria-label="다시하기" >
          <ArrowUturnRightIcon className="h-5 w-5 text-gray-700" />
        </CircleIconButton>
        <CircleIconButton onClick={() => {}} aria-label="저장하기" >
          <ArchiveBoxIcon className="h-5 w-5 text-gray-700" />
        </CircleIconButton>
      </div>
      {/* 에디터 */}
      <div className="w-full flex-1 min-h-0 flex flex-col items-center justify-start overflow-y-auto p-4">
        <div className="w-full max-w-4xl flex flex-col">
          <TextInput 
            type='text' 
            className='w-full pt-0 text-4xl font-extrabold text-center border-none overflow-auto focus:outline-none focus:border-none focus:ring-0 focus:underline focus:underline-offset-4' 
            placeholder='어울리는 제목을 붙여주세요' 
            value={title} 
            onChange={setTitle} 
          />
          <div className={`editor-wrapper w-full h-fit p-6 min-h-[60vh] border-none overflow-hidden max-h-none antialiased focus:outline-none transition resize-none placeholder:text-muted ${namum.className} font-sans border-none relative`} style={{marginBottom: '30px' }}>
            <EditorContent editor={editor} />
            
            {/* BubbleMenu - 공식 React 컴포넌트 사용 */}
            {editor && (
              <BubbleMenu 
                editor={editor} 
                tippyOptions={{ 
                  duration: 200,
                  placement: 'top',
                }}
                shouldShow={({ editor }) => {
                  const { from, to } = editor.state.selection
                  const selectedText = editor.state.doc.textBetween(from, to).trim()
                  return from !== to && selectedText.length > 0 && selectedText.length < 500
                }}
              >
                <div className="flex items-center gap-0.5 rounded-lg bg-black shadow-xl border border-gray-700 p-1">
                  <button
                    onClick={() => {
                      // 의미찾기 버튼 클릭 시 trigger_ai 로그
                      if (canLog && entryId && editor) {
                        const { from, to } = editor.state.selection;
                        const selectedText = editor.state.doc.textBetween(from, to).trim();
                        if (selectedText) {
                          logAITrigger(entryId, selectedText);
                        }
                      }
                      handleBubbleMenuAugment();
                    }}
                    disabled={bubbleMenuLoading}
                    className="flex items-center justify-center px-3 py-1.5 rounded-md hover:bg-gray-800 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold text-white hover:text-gray-300"
                    title={bubbleMenuLoading ? "AI가 분석 중..." : "AI로 의미 찾기"}
                  >
                    {bubbleMenuLoading ? (
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                    ) : (
                      "의미찾기"
                    )}
                  </button>
                </div>
              </BubbleMenu>
            )}
            

          </div>
        </div>
      </div>
      {/* 오른쪽 디스플레이 패널 */}
      <aside className="hidden md:flex md:w-96 border-l p-4 flex-shrink-0 flex-col overflow-y-auto">
        <div className="flex flex-col space-y-4">
          {/* <Button onClick={handleAugment} disabled={loading} className="px-4 py-2 rounded">
            {loading ? '고민하는 중...' : '의미 찾기'}
          </Button> */}
          {/* 증강 옵션 */}
          {(bubbleMenuOptions || augmentOptions) && (
            <Card>
              <Heading level={4}>어떤 문장을 추가할까요?</Heading>
              <ul className="space-y-2">
                {(bubbleMenuOptions || augmentOptions)?.map((option, idx) => (
                  <li key={idx}>
                    <button
                      onClick={() => {
                        // 옵션 클릭 시 insert_ai_text 로그
                        if (canLog && entryId) {
                          logAITextInsert(entryId, option);
                        }
                        bubbleMenuOptions
                          ? applyBubbleMenuAugmentation(option)
                          : applyAugmentation(option);
                      }}
                      className="text-left bg-white border px-4 py-2 rounded hover:bg-indigo-100 w-full"
                    >
                      {option}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {/* 추가된 문장 */}
          {augments.length > 0 && (
            <div className="mt-4 text-sm text-gray-700">
              <strong>추가된 문장:</strong>
              {augments.map((a, i) => (
                <div key={i} className="mt-2 p-2 border rounded bg-gray-50">
                  <p className="text-blue-700 italic">{a.inserted}</p>
                  <div className="mt-1 text-xs text-gray-500">
                    <span className="inline-block px-2 py-1 bg-blue-100 rounded mr-2">
                      {a.category}
                    </span>
                    <span className="text-gray-400">ID: {a.requestId.slice(-8)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
