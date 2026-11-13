-- =====================================================================
-- 新機組通知
--
-- 台電出現沒看過的機組時，ingest_snapshot() 本來就會自動把它加進 units，
-- 並依台電的類型給一個預設分類（default_category_id）。
-- 這個檔案再加上「通知」：
--   1. units 加一個欄位 notified_at：寄過通知信的時間。空值＝還沒通知過的新機組。
--   2. pending_unit_notices()：列出還沒通知過的新機組，以及需要使用者決定的事。
--   3. mark_units_notified()：信寄出去之後，標記成已通知。
-- 寄信由 Edge Function「collect」負責（見 supabase/functions/collect/index.ts）。
--
-- 使用方式：整份複製，貼到 SQL Editor（下拉選單選 Database），按 Run。
-- 重複執行沒關係。
-- =====================================================================


-- 1. notified_at 欄位。
--    第一次加這個欄位時，把現有的 191 個機組都標記成「已通知」，避免一次寄出 191 封信。
--    （重複執行時欄位已經存在，就不會再動到它，不會把還沒通知的新機組誤標成已通知。）
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'units' and column_name = 'notified_at') then
    alter table units add column notified_at timestamptz;
    update units set notified_at = now();
  end if;
end $$;


-- 2. 還沒通知過的新機組
--    needs_category：分類需要使用者決定
--      - 台電類型是「風力」：資料沒有區分陸域和離岸，預設歸「陸域風電」，要確認
--      - 台電類型是沒看過的（default_category_id 回傳空值）：不知道要歸哪一類
--    每個新機組都需要英文名稱（name_en 是空的）。
create or replace function pending_unit_notices()
returns table (
  id             smallint,
  type           text,
  name           text,
  category_zh    text,
  needs_category text,
  capacity_mw    real,
  output_mw      real,
  remark         text,
  first_seen_at  timestamptz
)
language sql stable
set search_path = public
as $$
  select u.id, u.type, u.name, c.name_zh,
         case
           when u.category_id is null then '台電類型「' || u.type || '」沒看過，不知道要歸哪一類'
           when u.type = '風力'       then '風力機組預設歸「陸域風電」，請確認是陸域還是離岸'
         end,
         r.capacity_mw, r.output_mw, r.remark, u.first_seen_at
    from units u
    left join categories c on c.id = u.category_id
    left join lateral (select capacity_mw, output_mw, remark from readings
                        where unit_id = u.id order by observed_at desc limit 1) r on true
   where u.notified_at is null
   order by u.id;
$$;


-- 3. 標記成已通知
create or replace function mark_units_notified(ids smallint[])
returns void
language sql
set search_path = public
as $$
  update units set notified_at = now() where id = any(ids) and notified_at is null;
$$;


-- 只有收集程式（service role）可以用
revoke execute on function pending_unit_notices()       from public, anon, authenticated;
revoke execute on function mark_units_notified(smallint[]) from public, anon, authenticated;
grant  execute on function pending_unit_notices()       to service_role;
grant  execute on function mark_units_notified(smallint[]) to service_role;


-- 檢查：應該是 0（現有的機組都已標記成已通知）
select count(*) as 還沒通知的新機組 from units where notified_at is null;
