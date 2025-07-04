import Highlight from '@tiptap/extension-highlight'
import { mergeAttributes } from '@tiptap/core'
import { calculateEditRatio } from './diff'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiHighlight: {
      setAIHighlight: (attributes: { requestId: string; category: string; dataOriginal?: string; editRatio?: string }) => ReturnType
      unsetAIHighlight: () => ReturnType
    }
  }
}

// Tiptap의 Highlight 확장을 기반으로 AI 텍스트 투명도 관리 확장
export const AIHighlight = Highlight.extend({
  name: 'aiHighlight',
  
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      aiText: {
        default: 'true',
        parseHTML: () => 'true',
        renderHTML: () => ({ 'ai-text': 'true' }),
      },
      requestId: {
        default: null,
        parseHTML: (element) => element.getAttribute('request-id'),
        renderHTML: (attributes) => ({ 'request-id': attributes.requestId }),
      },
      category: {
        default: 'interpretive',
        parseHTML: (element) => element.getAttribute('category'),
        renderHTML: (attributes) => ({ category: attributes.category }),
      },
      dataOriginal: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-original'),
        renderHTML: (attributes) => ({ 'data-original': attributes.dataOriginal }),
      },
      editRatio: {
        default: '0',
        parseHTML: (element) => element.getAttribute('edit-ratio'),
        renderHTML: (attributes) => ({ 'edit-ratio': attributes.editRatio }),
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'mark[ai-text]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    try {
      // edit-ratio 속성을 기반으로 투명도 계산
      const editRatio = parseFloat(HTMLAttributes['edit-ratio'] || '0')
      const opacity = Math.max(0, 1 - editRatio) // 수정이 많을수록 투명도가 낮아짐
      
      // CSS 변수에서 색상 가져오기 (기본값 제공)
      const getCSSVariable = (name: string, fallback: string) => {
        if (typeof window !== 'undefined') {
          const value = getComputedStyle(document.documentElement).getPropertyValue(name)
          return value || fallback
        }
        return fallback
      }
      
      const highlightBg = getCSSVariable('--ai-highlight-bg', 'rgba(219, 234, 254, 1)') // 기본 파란색      
      // 투명도 적용
      const backgroundColor = opacity > 0 ? highlightBg.replace('1)', `${opacity})`) : 'transparent'
      
      // data-original 속성 보호 및 유효한 속성만 필터링
      const dataOriginal = HTMLAttributes['data-original']
      const editRatioAttr = HTMLAttributes['edit-ratio']
      const { 'data-original': _, 'edit-ratio': __, ...otherAttributes } = HTMLAttributes
      
      // 유효한 속성만 필터링 (숫자 키나 잘못된 속성명 제거)
      const validAttributes = Object.entries(otherAttributes).reduce((acc, [key, value]) => {
        // 유효한 속성명인지 확인 (문자로 시작하고 특수문자 제한)
        if (typeof key === 'string' && /^[a-zA-Z][a-zA-Z0-9\-_]*$/.test(key)) {
          acc[key] = value
        }
        return acc
      }, {} as Record<string, any>)
      
      return ['mark', { 
        ...validAttributes,
        'data-original': dataOriginal, // 원본 텍스트 보존
        'edit-ratio': editRatioAttr || '0', // edit-ratio 보존
        style: `background: ${backgroundColor} !important; color: inherit !important; padding: 4px 0; border-radius: 2px;`
      }, 0]
    } catch (error) {
      // 에러 발생 시 기본 마크 반환
      return ['mark', mergeAttributes(HTMLAttributes, { 
        'ai-text': 'true',
        style: 'background: rgba(219, 234, 254, 1) !important; color: inherit !important; padding: 2px 0; border-radius: 2px;'
      }), 0]
    }
  },

  addCommands() {
    return {
      setAIHighlight: (attributes) => ({ commands }) => {
        return commands.setMark(this.name, attributes)
      },
      unsetAIHighlight: () => ({ commands }) => {
        return commands.unsetMark(this.name)
      },
    }
  },
}) 