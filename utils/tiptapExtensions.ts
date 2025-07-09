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
      },
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attributes) => attributes.style ? { style: attributes.style } : {},
      },
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
      // data-original 속성 보호 및 유효한 속성만 필터링
      const dataOriginal = HTMLAttributes['data-original']
      const editRatioAttr = HTMLAttributes['edit-ratio']
      const styleAttr = HTMLAttributes.style
      const { 'data-original': _, 'edit-ratio': __, style: ___, ...otherAttributes } = HTMLAttributes
      
      return [
        'mark',
        {
          ...otherAttributes,
          'ai-text': 'true',
          'data-original': dataOriginal,
          'edit-ratio': editRatioAttr,
          ...(styleAttr ? { style: styleAttr } : {}), // style 속성이 있으면 포함
        },
        0,
      ]
    } catch (error) {
      console.error('AIHighlight renderHTML error:', error)
      return ['mark', { 'ai-text': 'true' }, 0]
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