import { Mark } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiText: {
      setAIText: (attributes: { requestId: string; category: string; 'data-original'?: string }) => ReturnType
      unsetAIText: () => ReturnType
    }
  }
}

export const AIText = Mark.create({
  name: 'aiText',
  
  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      'ai-text': {
        default: 'true',
      },
      'request-id': {
        default: null,
      },
      'category': {
        default: 'interpretive',
      },
      'data-original': {
        default: null,
      },
      'edit-ratio': {
        default: '0',
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[ai-text]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0]
  },

  addCommands() {
    return {
      setAIText: (attributes) => ({ commands }) => {
        return commands.setMark(this.name, attributes)
      },
      unsetAIText: () => ({ commands }) => {
        return commands.unsetMark(this.name)
      },
    }
  },
}) 