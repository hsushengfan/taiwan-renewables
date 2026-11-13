-- =====================================================================
-- 排除 2026-11-13 00:00（台灣時間）之前的資料，資料從第一個完整的一天開始
--
-- 原因：
--   - 2026-11-12 10:10 之前：舊的 GitHub Actions 零星收集，三天只有 6 個時間點，不具代表性。
--   - 2026-11-12 10:10 ～ 24:00：Supabase 開始收集的第一天，只有半天（資料完整度約 58%）。
--   2026-11-13 是第一個從 00:00 開始、每 10 分鐘都有資料的完整一天，所以從這裡開始算。
--
-- 會刪除：這個時間之前的 readings、category_readings、daily_unit_stats。
-- 不會刪除：Storage 裡的原始檔、GitHub 上 data/raw 的原始檔、collection_runs 的紀錄。
--   （2026-11-12 10:10 之後的原始檔都在 Storage，真的需要的話可以匯回來。）
--
-- 使用方式：整份複製，貼到 SQL Editor（下拉選單選 Database），按 Run。
-- 重複執行沒關係。
-- =====================================================================

-- 1. 每 10 分鐘的資料
delete from category_readings where observed_at < '2026-11-13 00:00:00+08';
delete from readings          where observed_at < '2026-11-13 00:00:00+08';

-- 2. 每日彙總
delete from daily_unit_stats where day < '2026-11-13';

-- 3. 機組的「第一次出現時間」改成剩下的資料裡最早的一筆
update units u
   set first_seen_at = r.first_at
  from (select unit_id, min(observed_at) as first_at from readings group by unit_id) r
 where r.unit_id = u.id
   and u.first_seen_at < r.first_at;

-- 檢查：最早的資料時間應該是 2026-11-13 00:00
select min(observed_at) as 最早的資料時間, count(*) as 資料筆數 from readings;
