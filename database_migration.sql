-- entries 테이블에 추가 메트릭 컬럼들 추가 (안전한 버전)
-- 이 스크립트를 Supabase 대시보드의 SQL 에디터에서 실행하세요

ALTER TABLE entries 
ADD COLUMN IF NOT EXISTS left_panel_requests INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS right_panel_requests INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS left_panel_insertions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS right_panel_insertions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_texts_added JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS syllable_count INTEGER DEFAULT 0;

-- 컬럼 추가 후 기존 데이터의 기본값 설정
UPDATE entries 
SET 
  left_panel_requests = COALESCE(left_panel_requests, 0),
  right_panel_requests = COALESCE(right_panel_requests, 0),
  left_panel_insertions = COALESCE(left_panel_insertions, 0),
  right_panel_insertions = COALESCE(right_panel_insertions, 0),
  ai_texts_added = COALESCE(ai_texts_added, '[]'::jsonb),
  syllable_count = COALESCE(syllable_count, 0)
WHERE 
  left_panel_requests IS NULL 
  OR right_panel_requests IS NULL 
  OR left_panel_insertions IS NULL 
  OR right_panel_insertions IS NULL 
  OR ai_texts_added IS NULL 
  OR syllable_count IS NULL;

-- 새로운 컬럼들에 대한 설명 추가
COMMENT ON COLUMN entries.left_panel_requests IS '왼쪽 패널(경험 찾기)을 통해 요청한 횟수';
COMMENT ON COLUMN entries.right_panel_requests IS '오른쪽 패널(의미 만들기)을 통해 요청한 횟수';  
COMMENT ON COLUMN entries.left_panel_insertions IS '왼쪽 패널을 통해 받은 응답 중 실제 본문에 추가된 횟수';
COMMENT ON COLUMN entries.right_panel_insertions IS '오른쪽 패널을 통해 받은 응답 중 실제 본문에 추가된 횟수';
COMMENT ON COLUMN entries.ai_texts_added IS '본문에 추가된 모든 AI 텍스트의 모음 JSON';
COMMENT ON COLUMN entries.syllable_count IS 'HTML 요소를 제외한 순수 본문의 syllable count'; 