# Augmentiary V4

AI 기반의 해석 제안을 통해 사용자의 자기 성찰과 의미 생성을 돕는 인터랙티브 저널링 시스템.

## 주요 기능

- 📝 **인터랙티브 저널링**: AI와의 상호작용을 통한 의미 생성
- 🤖 **AI 해석 제안**: 텍스트 선택 시 "because...", "so that..." 형식의 제안
- 📊 **ESM (Experience Sampling Method)**: 맥락 정보 수집
- 📈 **상호작용 로그**: 사용자 행동 패턴 분석을 위한 로그 기록

## 인터랙션 로그 시스템

### 개요

사용자의 모든 상호작용을 자동으로 기록하여 연구 및 분석에 활용합니다.

### 주요 특징

- **비동기 배치 처리**: UX에 영향을 주지 않는 비동기 로그 기록
- **KST 시간 기준**: 모든 타임스탬프는 한국 표준시(KST) 기준
- **자동 재시도**: 네트워크 오류 시 자동 재시도 로직
- **페이지 언로드 보호**: 페이지 종료 시 남은 로그 자동 저장

### 로그 타입

| 액션 타입 | 설명 |
|-----------|------|
| `start_writing` | Writing 페이지 진입 |
| `select_text` | 텍스트 선택 |
| `deselect_text` | 텍스트 선택 해제 |
| `trigger_ai` | AI 호출 버튼 클릭 |
| `receive_ai` | AI 응답 수신 |
| `insert_ai_text` | AI 제안 텍스트 삽입 |
| `edit_ai_text` | AI 제안 텍스트 수정 |
| `edit_manual_text` | 일반 텍스트 수정 |
| `click_save` | 저장 버튼 클릭 |
| `esm_submit` | ESM 응답 제출 |
| `logout` | 로그아웃 |

### 사용법

#### 1. 기본 사용

```tsx
import { useInteractionLog } from '../hooks/useInteractionLog'

function MyComponent() {
  const { logAsync, logSync } = useInteractionLog()

  const handleButtonClick = () => {
    // 비동기 로그 (UX에 영향 없음)
    logAsync(ActionType.CLICK_SAVE, { buttonType: 'primary' })
  }

  const handleImportantAction = async () => {
    // 동기 로그 (즉시 저장)
    await logSync(ActionType.ESM_SUBMIT, { consent: true })
  }
}
```

#### 2. 특정 액션 로그

```tsx
function WritingPage() {
  const {
    logStartWriting,
    logTextSelection,
    logAITrigger,
    logAITextInsert,
    logSaveClick
  } = useInteractionLog()

  useEffect(() => {
    logStartWriting() // 페이지 진입 시
  }, [])

  const handleTextSelect = (selectedText: string) => {
    logTextSelection(selectedText)
  }

  const handleAICall = (selectedText: string) => {
    logAITrigger(selectedText)
    // AI 호출 로직...
  }

  const handleSave = () => {
    logSaveClick(entryId)
    // 저장 로직...
  }
}
```

#### 3. 메타데이터 포함

```tsx
const handleTextEdit = (originalText: string, newText: string) => {
  logAsync(ActionType.EDIT_MANUAL_TEXT, {
    originalText,
    newText,
    changeType: 'manual_edit',
    timestamp: Date.now()
  })
}
```

### 데이터베이스 구조

#### `interaction_logs` 테이블

```sql
CREATE TABLE interaction_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_code TEXT NOT NULL,
  entry_id UUID REFERENCES entries(id),
  action_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 설정

#### 환경 변수

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### Supabase 설정

1. `interaction_logs` 테이블 생성
2. RLS (Row Level Security) 정책 설정
3. 인덱스 생성 (성능 최적화)

```sql
-- 인덱스 생성
CREATE INDEX idx_interaction_logs_participant ON interaction_logs(participant_code);
CREATE INDEX idx_interaction_logs_timestamp ON interaction_logs(timestamp);
CREATE INDEX idx_interaction_logs_action_type ON interaction_logs(action_type);
```

### 성능 최적화

- **배치 크기**: 기본 10개씩 배치 처리
- **플러시 간격**: 5초마다 자동 플러시
- **재시도 로직**: 실패 시 큐에 재추가
- **메모리 관리**: 페이지 언로드 시 자동 정리

### 모니터링

로그 기록 상태를 확인할 수 있습니다:

```tsx
const { canLog } = useInteractionLog()

if (!canLog) {
  console.warn('사용자 정보가 없어 로그를 기록할 수 없습니다.')
}
```

## 기술 스택

- **Frontend**: Next.js, TypeScript, TailwindCSS
- **Backend**: Supabase (Auth, Database, Storage)
- **AI**: OpenAI GPT-4o
- **Deployment**: Vercel

## 개발 가이드

### 로그 추가하기

새로운 액션 타입을 추가하려면:

1. `types/log.ts`에 액션 타입 추가
2. `useInteractionLog.ts`에 전용 함수 추가
3. 컴포넌트에서 사용

### 로그 분석

Supabase 대시보드에서 로그 데이터를 확인하고 분석할 수 있습니다:

```sql
-- 사용자별 액션 통계
SELECT 
  participant_code,
  action_type,
  COUNT(*) as action_count
FROM interaction_logs
GROUP BY participant_code, action_type
ORDER BY participant_code, action_count DESC;
```

## 라이선스

MIT License

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/pages/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/pages/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.
