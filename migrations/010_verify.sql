-- Verify migration 010: all tables exist with TEXT user_id columns

SELECT
  table_name,
  column_name,
  data_type,
  CASE WHEN data_type = 'text' THEN 'OK' ELSE 'NEEDS FIX' END AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (column_name = 'user_id')
    OR (table_name = 'profiles' AND column_name = 'id')
  )
ORDER BY table_name, column_name;
