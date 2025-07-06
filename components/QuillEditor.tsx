import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useQuill } from 'react-quilljs';
import 'quill/dist/quill.snow.css';
import { Button, Heading, Card, Textarea, TextInput } from './index'
import { ArrowUturnLeftIcon, ArrowUturnRightIcon, ArchiveBoxIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import CircleIconButton from './CircleIconButton';
import { Nanum_Myeongjo } from 'next/font/google'
import { 
  generateRequestId, 
  findAITextElement, 
  updateAITextOpacity,
  createAITextAttributes,
  registerAITextFormat,
  calculateBackgroundOpacity,
  getBackgroundColor
} from '../utils/editorHelpers'
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
  const [augments, setAugments] = useState<{ start: number; end: number; inserted: string; requestId: string; category: AICategory }[]>([])
  const [beliefSummary, setBeliefSummary] = useState('')
  const [augmentOptions, setAugmentOptions] = useState<string[] | null>(null)
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number; requestId?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [fontMenuOpen, setFontMenuOpen] = useState(false)

  const { quill, quillRef } = useQuill({
    modules: {
        toolbar: false,  //custom DOM toolbar 사용
        history: {
            delay: 1000,
            maxStack: 100,
            userOnly: true,
          },
    },
    formats: ['background'],
  })

  // AI 텍스트 포맷 등록
  useEffect(() => {
    if (quill) {
      registerAITextFormat()
    }
  }, [quill])

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

  // Quill content change listener with AI text edit detection
  useEffect(() => {
    if (quill) {
      quill.on('text-change', (delta, oldDelta, source) => {
        const content = quill.root.innerHTML
        setEditorContent(content)
        if (onContentChange) {
          onContentChange(content)
        }

        // AI 텍스트 편집 감지 (사용자 편집인 경우에만)
        if (source === 'user') {
          detectAndUpdateAITextEdit()
        }
      })
    }
  }, [quill, onContentChange])

  // AI 텍스트 편집 감지 및 투명도 업데이트
  const detectAndUpdateAITextEdit = () => {
    if (!quill || !quillRef.current) return

    const selection = quill.getSelection()
    if (!selection) return

    const editorElement = quillRef.current.querySelector('.ql-editor') as HTMLElement
    if (!editorElement) return

    // 현재 커서 위치에서 AI 텍스트 요소 찾기
    const range = quill.getSelection()
    if (!range) return

    console.log('🔍 AI 텍스트 편집 감지 시작')

    // 선택 영역이 있는 경우
    if (range.length > 0) {
      // 선택 영역의 시작점과 끝점에서 AI 텍스트 찾기
      const startNode = quill.getLeaf(range.index)[0]?.domNode || null
      const endNode = quill.getLeaf(range.index + range.length)[0]?.domNode || null
      
      const startAIText = findAITextElement(startNode, editorElement)
      const endAIText = findAITextElement(endNode, editorElement)
      
      if (startAIText) {
        console.log('✅ AI 텍스트 편집 감지 (시작점):', startAIText.textContent)
        updateAITextOpacity(startAIText)
      }
      if (endAIText && endAIText !== startAIText) {
        console.log('✅ AI 텍스트 편집 감지 (끝점):', endAIText.textContent)
        updateAITextOpacity(endAIText)
      }
    } else {
      // 커서만 있는 경우
      const currentNode = quill.getLeaf(range.index)[0]?.domNode || null
      const aiTextElement = findAITextElement(currentNode, editorElement)
      
      if (aiTextElement) {
        console.log('✅ AI 텍스트 편집 감지 (커서):', aiTextElement.textContent)
        updateAITextOpacity(aiTextElement)
      } else {
        console.log('ℹ️ AI 텍스트 요소를 찾을 수 없음')
      }
    }
  }

  useEffect(() => {
    const editor = quillRef.current?.querySelector('.ql-editor') as HTMLElement | null
    if (editor) {
        editor.classList.add(
            'text-base',
            'leading-10',
            'antialiased',
            'font-serif',
            'font-normal',
            'text-black',
            'caret-stone-900'
          );
      editor.style.fontFamily = `'Nanum Myeongjo', -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Apple SD Gothic Neo", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif'`
    }
  }, [quillRef])  

  const applyFontSize = (value: string) => {
    const sizeMap: Record<string, string> = {
      small: '0.85rem',
      normal: '1rem',
      large: '1.25rem',
      huge: '1.5rem',
    }
    const editor = quillRef.current?.querySelector('.ql-editor') as HTMLElement | null
    if (editor) editor.style.fontSize = sizeMap[value] || '1rem'
  }

  const handleAugment = async () => {
    if (loading || !quill) return

    const selection = quill.getSelection()
    if (!selection) return alert('텍스트를 선택하세요.')

    const { index, length } = selection;
    const selectedText = quill.getText(index, length).trim()
    if (!selectedText) return alert('텍스트를 선택하세요.')

    setLoading(true)
    setSelectionRange({ start: index, end: index + length })
    
    const fullText = quill.getText();
    const diaryEntryMarked = fullText.slice(0, index + length) + ' <<INSERT HERE>> ' + fullText.slice(index + length);

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
          data.interpretiveAgentResult.option1.text,
          data.interpretiveAgentResult.option2.text,
          data.interpretiveAgentResult.option3.text,
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
    if (!selectionRange || !quill) return
    const { end, requestId } = selectionRange

    // API에서 받은 request ID 사용, 없으면 새로 생성
    const finalRequestId = requestId || generateRequestId()
    const category: AICategory = 'interpretive'

    quill.setSelection(end, 0)
    
    // Quill 포맷을 사용하여 AI 텍스트 삽입
    const aiTextAttributes = createAITextAttributes(finalRequestId, category, inserted)
    quill.insertText(end, inserted, aiTextAttributes)
    
    console.log('✅ AI 텍스트 삽입 완료:', inserted, aiTextAttributes)

    setAugments((prev) => [...prev, { 
      start: end, 
      end: end + inserted.length, 
      inserted,
      requestId: finalRequestId,
      category
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
        
        <CircleIconButton onClick={() => quill?.history.undo()} aria-label="되돌리기" >
          <ArrowUturnLeftIcon className="h-5 w-5 text-gray-700" />
        </CircleIconButton>
        <CircleIconButton onClick={() => quill?.history.redo()} aria-label="다시하기" >
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
          <div ref={quillRef} className={`editor-wrapper w-full h-fit p-6 min-h-[60vh] border-none overflow-hidden max-h-none antialiased focus:outline-none transition resize-none placeholder:text-muted ${namum.className} font-sans border-none`} style={{marginBottom: '30px' }} />
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
