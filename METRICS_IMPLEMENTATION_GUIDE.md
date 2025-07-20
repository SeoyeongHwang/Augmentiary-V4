# 엔트리 메트릭 추가 구현 가이드

## 개요
엔트리를 Supabase에 저장할 때 다음 추가 메트릭들이 저장됩니다:

1. **left_panel_requests**: 왼쪽 패널(경험 찾기)을 통해 요청한 횟수
2. **right_panel_requests**: 오른쪽 패널(의미 만들기)을 통해 요청한 횟수  
3. **left_panel_insertions**: 왼쪽 패널을 통해 받은 응답 중 실제 본문에 추가된 횟수
4. **right_panel_insertions**: 오른쪽 패널을 통해 받은 응답 중 실제 본문에 추가된 횟수
5. **ai_texts_added**: 본문에 추가된 모든 AI 텍스트의 모음 JSON
6. **syllable_count**: HTML 요소를 제외한 순수 본문의 syllable count

## 설치 방법

### 1. 데이터베이스 마이그레이션 실행
`database_migration.sql` 파일의 내용을 Supabase 대시보드의 SQL 에디터에서 실행하세요.

### 2. 코드 변경사항
다음 파일들이 수정되었습니다:

- `components/TiptapEditor2.tsx`: 메트릭 추적 로직 추가
- `pages/write.tsx`: 메트릭 데이터 수집 및 전달
- `pages/api/entries.ts`: 서버에서 메트릭 데이터 처리
- `types/entry.ts`: Entry 인터페이스에 새 필드 추가

## 작동 방식

### 사용자 액션 추적
- **경험 찾기 요청**: 사용자가 버블메뉴에서 "맞닿은 경험 찾기"를 클릭할 때마다 `left_panel_requests` 카운트 증가
- **의미 만들기 요청**: 사용자가 버블메뉴에서 "의미 만들기"를 클릭할 때마다 `right_panel_requests` 카운트 증가
- **AI 텍스트 삽입**: 사용자가 "이어쓰기" 버튼을 클릭하여 실제로 본문에 텍스트를 추가할 때 해당 패널의 insertion 카운트 증가

### 메트릭 데이터 구조
```typescript
{
  leftPanelRequests: number,
  rightPanelRequests: number,
  leftPanelInsertions: number,
  rightPanelInsertions: number,
  aiTextsAdded: [
    {
      text: string,
      type: 'experience' | 'generation',
      timestamp: string,
      source: 'left' | 'right',
      metadata: {
        // 왼쪽 패널(경험 찾기) 메타데이터
        strategy?: string,           // 연결 전략
        originalEntryId?: string,    // 원본 일기 ID
        title?: string,              // 원본 일기 제목
        isPastContext?: boolean,     // 과거 맥락 여부
        sum_innerstate?: string,     // 내면 상태 요약
        sum_insight?: string,        // 인사이트 요약
        created_at?: string,         // 원본 일기 생성일
        
        // 오른쪽 패널(의미 만들기) 메타데이터
        approach?: string,           // 접근 방식
        resource?: string,           // 사용된 리소스
        index?: number,              // 옵션 인덱스 (1,2,3)
        category?: string,           // AI 카테고리
        confidence?: number          // 신뢰도 점수
      }
    }
  ],
  syllableCount: number
}
```

### 저장 시점
- 사용자가 "저장하기" 버튼을 클릭하고 ESM을 제출할 때 모든 메트릭이 데이터베이스에 저장됩니다.
- 메트릭 데이터는 `entries` 테이블의 새로운 컬럼들에 저장됩니다.

## 데이터 조회 예시

### 기본 메트릭 조회
```sql
SELECT 
  id,
  title,
  left_panel_requests,
  right_panel_requests,
  left_panel_insertions, 
  right_panel_insertions,
  syllable_count,
  jsonb_array_length(COALESCE(ai_texts_added, '[]'::jsonb)) as ai_texts_count
FROM entries 
WHERE participant_code = 'YOUR_PARTICIPANT_CODE'
ORDER BY created_at DESC;
```

### AI 텍스트 메타데이터 상세 조회
```sql
SELECT 
  id,
  title,
  jsonb_path_query_array(ai_texts_added, '$[*].type') as text_types,
  jsonb_path_query_array(ai_texts_added, '$[*].source') as text_sources,
  jsonb_path_query_array(ai_texts_added, '$[*].metadata.strategy') as strategies,
  jsonb_path_query_array(ai_texts_added, '$[*].metadata.approach') as approaches,
  ai_texts_added
FROM entries 
WHERE participant_code = 'YOUR_PARTICIPANT_CODE'
  AND ai_texts_added IS NOT NULL 
  AND jsonb_array_length(ai_texts_added) > 0
ORDER BY created_at DESC;
```

### 특정 패널 사용량 분석
```sql
-- 왼쪽 패널(경험 찾기) 사용 분석
SELECT 
  COUNT(*) as total_entries,
  AVG(left_panel_requests) as avg_left_requests,
  AVG(left_panel_insertions) as avg_left_insertions,
  COUNT(CASE WHEN left_panel_requests > 0 THEN 1 END) as entries_with_left_usage
FROM entries 
WHERE participant_code = 'YOUR_PARTICIPANT_CODE';

-- 오른쪽 패널(의미 만들기) 사용 분석  
SELECT 
  COUNT(*) as total_entries,
  AVG(right_panel_requests) as avg_right_requests,
  AVG(right_panel_insertions) as avg_right_insertions,
  COUNT(CASE WHEN right_panel_requests > 0 THEN 1 END) as entries_with_right_usage
FROM entries 
WHERE participant_code = 'YOUR_PARTICIPANT_CODE';
```

## 특징
- **기존 코드 호환성**: 기존 코드는 그대로 작동하며, 새로운 필드는 선택적입니다.
- **안전한 구현**: 데이터베이스 컬럼이 없어도 에러가 발생하지 않도록 처리했습니다.
- **실시간 추적**: 사용자의 모든 액션이 실시간으로 추적되고 저장 시점에 한 번에 기록됩니다.
- **상세한 로깅**: 추가된 AI 텍스트의 상세 정보(타입, 소스, 메타데이터)도 함께 저장됩니다.

## 디버깅
콘솔에서 다음과 같은 로그를 확인할 수 있습니다:
- `📊 [SAVE_METRICS] 저장 시점 메트릭`: 에디터에서 수집된 메트릭
- `📊 [WRITE] 받은 에디터 메트릭`: write.tsx에서 받은 메트릭
- `📊 [API] 받은 추가 메트릭`: 서버 API에서 받은 메트릭 