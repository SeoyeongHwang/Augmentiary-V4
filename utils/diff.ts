/**
 * 한국어 음절 기준 텍스트 변경 횟수 계산
 */

/**
 * 텍스트를 한국어 음절 단위로 분해
 * @param text - 분해할 텍스트
 * @returns 음절 배열
 */
export function splitIntoSyllables(text: string): string[] {
  return Array.from(text)
}

/**
 * Levenshtein 거리(편집 거리) 계산
 * @param str1 - 첫 번째 문자열
 * @param str2 - 두 번째 문자열
 * @returns 편집 거리
 */
export function levenshteinDistance(str1: string[], str2: string[]): number {
  const matrix: number[][] = []

  // 초기화
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  // 거리 계산
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2[i - 1] === str1[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 치환
          matrix[i - 1][j] + 1,     // 삽입
          matrix[i][j - 1] + 1      // 삭제
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}

/**
 * AI 텍스트의 수정 정도를 계산하여 투명도 비율 반환
 * @param originalText - 원본 AI 텍스트
 * @param currentText - 현재 수정된 텍스트
 * @returns 투명도 비율 (0.0 ~ 1.0)
 */
export function calculateEditRatio(originalText: string, currentText: string): number {
  if (!originalText || !currentText) return 0
  
  // 음절로 분해
  const originalSyllables = splitIntoSyllables(originalText)
  const currentSyllables = splitIntoSyllables(currentText)
  
  // Levenshtein 거리 계산 (삭제, 추가, 수정 모두 포함)
  const distance = levenshteinDistance(originalSyllables, currentSyllables)
  
  // 원본 텍스트 길이 대비 수정 비율 계산
  const editRatio = distance / originalSyllables.length
  
  // 0-1 범위로 정규화
  const normalizedRatio = Math.min(editRatio, 1.0)
  
  console.log(`📊 수정 분석:`, {
    original: originalText,
    current: currentText,
    originalLength: originalSyllables.length,
    currentLength: currentSyllables.length,
    distance,
    editRatio: `${(editRatio * 100).toFixed(1)}%`,
    normalizedRatio: `${(normalizedRatio * 100).toFixed(1)}%`
  })
  
  return normalizedRatio
}

/**
 * AI 텍스트 요소의 수정 비율 업데이트
 * @param element - AI 텍스트 요소
 * @param originalText - 원본 텍스트
 * @param currentText - 현재 텍스트
 */
export function updateAITextEditRatio(
  element: HTMLElement, 
  originalText: string, 
  currentText: string
): void {
  const editRatio = calculateEditRatio(originalText, currentText)
  element.setAttribute('edit-ratio', editRatio.toString())
  
  console.log(`📝 AI 텍스트 수정 비율 업데이트: ${(editRatio * 100).toFixed(1)}%`)
}

// 기존 함수는 호환성을 위해 유지하되 내부적으로 새로운 함수 사용
export function calculateEditCount(originalText: string, currentText: string): number {
  const ratio = calculateEditRatio(originalText, currentText)
  return Math.round(ratio * 5) // 0-5 범위로 변환 (기존 호환성)
}
