import { calculateEditRatio } from './diff'

// Quill AI 텍스트 포맷 등록
export function registerAITextFormat() {
  // Quill이 로드된 후에 실행되어야 함
  if (typeof window !== 'undefined' && (window as any).Quill) {
    const Quill = (window as any).Quill
    
    // AI 텍스트를 위한 커스텀 포맷
    const AITextFormat = Quill.import('formats/background')
    AITextFormat.tagName = 'span'
    
    // 커스텀 속성 추가 메서드
    AITextFormat.create = function(value: any) {
      const node = document.createElement('span')
      node.style.background = getBackgroundColor(OPACITY_CONFIG.START)
      node.setAttribute('ai-text', 'true')
      node.setAttribute('request-id', value.requestId || '')
      node.setAttribute('category', value.category || 'interpretive')
      node.setAttribute('data-original', value.originalText || '')
      node.setAttribute('edit-ratio', '0')
      return node
    }
    
    Quill.register(AITextFormat, true)
  }
}

// AI 텍스트 관련 유틸리티 함수들

// AI 텍스트 투명도 협상 관련 유틸리티 함수들

export interface AITextElement {
  element: HTMLElement;
  requestId: string;
  category: string;
  originalText: string;
  editRatio: number;
}

// 투명도 계산 상수
export const OPACITY_CONFIG = {
  START: 0.0,
  MAX: 1.0
} as const;

/**
 * 수정 비율에 따른 배경 투명도 계산
 * 수정이 많을수록 투명도가 낮아짐 (배경색이 연해짐)
 */
export const calculateBackgroundOpacity = (editRatio: number): number => {
  // 수정 비율이 높을수록 투명도가 낮아지도록 반전
  return OPACITY_CONFIG.MAX - editRatio * (OPACITY_CONFIG.MAX - OPACITY_CONFIG.START);
};

/**
 * 투명도 비율을 rgba 배경색으로 변환
 */
export const getBackgroundColor = (opacity: number): string => {
  // 투명도가 0이면 완전히 투명하게
  if (opacity <= 0) {
    return 'transparent !important';
  }
  // #deffee를 rgba로 변환 (222, 255, 238)
  return `rgba(222, 255, 238, ${opacity}) !important`;
};

/**
 * 고유한 request ID 생성
 */
export const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
};

/**
 * DOM에서 AI 텍스트 요소 찾기
 */
export const findAITextElement = (node: Node | null, container: HTMLElement): HTMLElement | null => {
  if (!node) return null
  
  // 현재 노드가 AI 텍스트 요소인지 확인
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as HTMLElement
    if (element.hasAttribute('ai-text')) {
      return element
    }
  }
  
  // 부모 요소들을 거슬러 올라가며 AI 텍스트 요소 찾기
  let current = node.parentElement
  while (current && current !== container) {
    if (current.hasAttribute('ai-text')) {
      return current
    }
    current = current.parentElement
  }
  
  return null
};

/**
 * AI 텍스트 요소의 정보 추출
 */
export const getAITextInfo = (element: HTMLElement): AITextElement | null => {
  if (!element.hasAttribute('ai-text')) return null;
  
  return {
    element,
    requestId: element.getAttribute('request-id') || '',
    category: element.getAttribute('category') || '',
    originalText: element.getAttribute('data-original') || element.textContent || '',
    editRatio: parseFloat(element.getAttribute('edit-ratio') || '0')
  };
};

/**
 * AI 텍스트 요소의 수정 비율 업데이트 및 투명도 적용
 */
export const updateAITextOpacity = (element: HTMLElement): void => {
  const originalText = element.getAttribute('data-original');
  const currentText = element.textContent || '';
  
  // data-original이 있는 경우에만 투명도 계산 (API에서 받은 AI 텍스트만)
  if (originalText) {
    const editRatio = calculateEditRatio(originalText, currentText);
    
    // edit-ratio 속성만 업데이트 (data-original은 절대 변경하지 않음)
    element.setAttribute('edit-ratio', editRatio.toString());
    
    // 투명도 계산 및 적용 (직접 스타일 적용)
    const opacity = calculateBackgroundOpacity(editRatio);
    element.style.background = getBackgroundColor(opacity);
  }
};

/**
 * AI 텍스트 요소 생성
 */
export const createAITextElement = (
  text: string, 
  requestId: string, 
  category: string
): HTMLElement => {
  const span = document.createElement('span');
  span.setAttribute('ai-text', 'true');
  span.setAttribute('request-id', requestId);
  span.setAttribute('category', category);
  span.setAttribute('data-original', text);
  span.setAttribute('edit-ratio', '0');
  span.style.background = getBackgroundColor(OPACITY_CONFIG.START);
  span.textContent = text;
  
  return span;
};

/**
 * AI 텍스트 속성 객체 생성
 */
export const createAITextAttributes = (
  requestId: string, 
  category: string,
  originalText?: string
): Record<string, any> => {
  return {
    background: getBackgroundColor(OPACITY_CONFIG.START),
    requestId,
    category,
    originalText: originalText || ''
  };
};

/**
 * debounce 유틸리티 (함수 실행을 delay, 마지막 호출만 실행)
 */
export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}


