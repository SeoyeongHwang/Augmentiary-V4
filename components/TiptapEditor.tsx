import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { AIText } from '../utils/tiptapExtensions'
import { Button, Heading, Card, Textarea, TextInput } from './index'
import { ArrowUturnLeftIcon, ArrowUturnRightIcon, ArchiveBoxIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import CircleIconButton from './CircleIconButton';
import { Nanum_Myeongjo } from 'next/font/google'
import { 
  generateRequestId, 
  findAITextElement, 
  createAITextAttributes,
  calculateBackgroundOpacity,
  getBackgroundColor
} from '../utils/editorHelpers'
import { calculateEditCount, calculateEditRatio } from '../utils/diff'
import type { AICategory } from '../types/ai'

const namum = Nanum_Myeongjo({
    subsets: ['latin'],
    weight: ['400', '700', '800'],
  })

export default function Editor({ 
  userId, 
  onTitleChange, 
  onContentChange 
}: { 
  userId: string
  onTitleChange?: (title: string) => void
  onContentChange?: (content: string) => void
}) {
  const [editorContent, setEditorContent] = useState('');
  const [title, setTitle] = useState('')

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

  const editor = useEditor({
    extensions: [
      StarterKit,
      AIText,
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      const content = editor.getHTML()
      setEditorContent(content)
      if (onContentChange) {
        onContentChange(content)
      }
      
      // AI 텍스트 편집 감지 (디바운스 적용)
      setTimeout(() => {
        handleAITextEdit()
      }, 100)
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

  // AI 텍스트 편집 감지 및 투명도 업데이트 (인라인 스타일 방식)
  const handleAITextEdit = useCallback(() => {
    if (!editor) return

    // DOM에서 직접 AI 텍스트 요소 찾기
    const editorElement = editor.view.dom as HTMLElement
    const aiElements = editorElement.querySelectorAll('[ai-text]')
    
    console.log(`🔍 AI 텍스트 요소 개수: ${aiElements.length}`)
    
    // 각 AI 요소에 대해 수정 정도 계산
    aiElements.forEach((element, index) => {
      const currentText = element.textContent || ''
      const originalText = element.getAttribute('data-original')
      
      // data-original이 있는 경우에만 투명도 계산 (API에서 받은 AI 텍스트만)
      if (originalText) {
        const editRatio = calculateEditRatio(originalText, currentText)
        
        // 배경 투명도 직접 계산 및 적용 (1.0 ~ 0.0 범위)
        // 수정이 많을수록 투명도가 낮아짐 (배경색이 연해짐)
        const maxOpacity = 1.0
        const minOpacity = 0.0
        const opacity = maxOpacity - editRatio * (maxOpacity - minOpacity)
        
        // 배경색 투명도만 적용 (글자색은 변경하지 않음)
        const htmlElement = element as HTMLElement
        const backgroundColor = getBackgroundColor(opacity)
        htmlElement.style.background = backgroundColor
        
        console.log(`✅ AI 텍스트 수정 감지:`, {
          requestId: element.getAttribute('request-id'),
          original: originalText.substring(0, 50) + '...',
          current: currentText.substring(0, 50) + '...',
          editRatio: `${(editRatio * 100).toFixed(1)}%`,
          opacity: opacity.toFixed(3),
          backgroundColor: backgroundColor,
          appliedStyle: htmlElement.style.background,
          computedStyle: window.getComputedStyle(htmlElement).backgroundColor
        })
      }
    })
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

  const handleAugment = async () => {
    if (loading || !editor) return

    const { from, to } = editor.state.selection
    if (from === to) return alert('텍스트를 선택하세요.')

    const selectedText = editor.state.doc.textBetween(from, to).trim()
    if (!selectedText) return alert('텍스트를 선택하세요.')

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

    // Tiptap에서 AI 텍스트 삽입
    editor.chain()
      .focus()
      .setTextSelection(end)
      .insertContent(inserted)
      .setTextSelection({ from: end, to: end + inserted.length })
      .setAIText({
        requestId: finalRequestId,
        category,
        'data-original': inserted
      })
      .run()
    
    // 삽입된 AI 텍스트 요소에 원본 텍스트 저장 (백업)
    setTimeout(() => {
      const editorElement = editor.view.dom as HTMLElement
      const aiElements = editorElement.querySelectorAll('[ai-text]')
      const lastElement = aiElements[aiElements.length - 1] as HTMLElement
      if (lastElement && lastElement.getAttribute('request-id') === finalRequestId) {
        lastElement.setAttribute('data-original', inserted)
        console.log('✅ AI 텍스트 원본 저장:', inserted)
      }
    }, 10)
    
    console.log('✅ AI 텍스트 삽입 완료:', inserted)

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
          <div className={`editor-wrapper w-full h-fit p-6 min-h-[60vh] border-none overflow-hidden max-h-none antialiased focus:outline-none transition resize-none placeholder:text-muted ${namum.className} font-sans border-none`} style={{marginBottom: '30px' }}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
      {/* 오른쪽 디스플레이 패널 */}
      <aside className="hidden md:flex md:w-96 border-l p-4 flex-shrink-0 flex-col overflow-y-auto">
        <div className="flex flex-col space-y-4">
          <Button onClick={handleAugment} disabled={loading} className="px-4 py-2 rounded">
            {loading ? '고민하는 중...' : '의미 찾기'}
          </Button>
          {/* 증강 옵션 */}
          {augmentOptions && (
            <Card>
              <Heading level={4}>어떤 문장을 추가할까요?</Heading>
              <ul className="space-y-2">
                {augmentOptions.map((option, idx) => (
                  <li key={idx}>
                    <button
                      onClick={() => applyAugmentation(option)}
                      className="text-left bg-white border px-4 py-2 rounded hover:bg-indigo-100"
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
