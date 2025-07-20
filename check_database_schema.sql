-- entries 테이블의 새로운 컬럼들이 제대로 추가되었는지 확인하는 SQL
-- Supabase 대시보드의 SQL 에디터에서 실행하세요

-- 1. entries 테이블의 모든 컬럼 정보 확인
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'entries' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. 새로 추가된 메트릭 컬럼들이 있는지 확인
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'entries' AND column_name = 'left_panel_requests') 
        THEN '✅ left_panel_requests 존재'
        ELSE '❌ left_panel_requests 없음'
    END as left_panel_requests_status,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'entries' AND column_name = 'right_panel_requests') 
        THEN '✅ right_panel_requests 존재'
        ELSE '❌ right_panel_requests 없음'
    END as right_panel_requests_status,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'entries' AND column_name = 'left_panel_insertions') 
        THEN '✅ left_panel_insertions 존재'
        ELSE '❌ left_panel_insertions 없음'
    END as left_panel_insertions_status,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'entries' AND column_name = 'right_panel_insertions') 
        THEN '✅ right_panel_insertions 존재'
        ELSE '❌ right_panel_insertions 없음'
    END as right_panel_insertions_status,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'entries' AND column_name = 'ai_texts_added') 
        THEN '✅ ai_texts_added 존재'
        ELSE '❌ ai_texts_added 없음'
    END as ai_texts_added_status,
    
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'entries' AND column_name = 'syllable_count') 
        THEN '✅ syllable_count 존재'
        ELSE '❌ syllable_count 없음'
    END as syllable_count_status;

-- 3. 최근 entries 테이블 데이터 확인 (메트릭 필드들 포함)
SELECT 
    id,
    participant_code,
    title,
    left_panel_requests,
    right_panel_requests,
    left_panel_insertions,
    right_panel_insertions,
    syllable_count,
    ai_texts_added,
    created_at
FROM entries 
ORDER BY created_at DESC 
LIMIT 5;

-- 4. ai_texts_added 필드의 구조 확인 (최신 항목)
SELECT 
    id,
    participant_code,
    title,
    jsonb_array_length(COALESCE(ai_texts_added, '[]'::jsonb)) as ai_texts_count,
    ai_texts_added
FROM entries 
WHERE ai_texts_added IS NOT NULL 
  AND jsonb_array_length(ai_texts_added) > 0
ORDER BY created_at DESC 
LIMIT 3;

-- 5. AI 텍스트 메타데이터 샘플 확인
SELECT 
    id,
    title,
    jsonb_path_query_array(ai_texts_added, '$[*].type') as text_types,
    jsonb_path_query_array(ai_texts_added, '$[*].source') as text_sources,
    jsonb_path_query_array(ai_texts_added, '$[*].metadata.strategy') as strategies,
    jsonb_path_query_array(ai_texts_added, '$[*].metadata.approach') as approaches
FROM entries 
WHERE ai_texts_added IS NOT NULL 
  AND jsonb_array_length(ai_texts_added) > 0
ORDER BY created_at DESC 
LIMIT 2; 