-- =====================================================================
-- 排除 2026-11-12 10:10（台灣時間）之前的零星資料
--
-- 原因：2026-11-12 10:10 之前的資料，是舊的 GitHub Actions 收集的，
-- 三天只收到 6 個時間點（應有幾百個），資料完整度只有 1～2%，不具代表性。
-- 2026-11-12 10:10 起改由 Supabase 每 3 分鐘收集，資料是連續的。
--
-- 會刪除：這個時間之前的 readings、category_readings，以及 11/10、11/11 的每日彙總。
-- 不會刪除：Storage 裡的原始檔、GitHub 上 data/raw 的原始檔、collection_runs 的紀錄。
--   所以真的需要的話，這些資料隨時可以從原始檔匯回來。
--
-- 使用方式：整份複製，貼到 SQL Editor（下拉選單選 Database），按 Run。
-- 重複執行沒關係。
-- =====================================================================

-- 1. 每 10 分鐘的資料
delete from category_readings where observed_at < '2026-11-12 10:10:00+08';
delete from readings          where observed_at < '2026-11-12 10:10:00+08';

-- 2. 每日彙總：11/10、11/11 整天刪掉；11/12 用剩下的資料重算
delete from daily_unit_stats where day < '2026-11-12';
select refresh_daily_stats('2026-11-12');

-- 3. 機組的「第一次出現時間」改成剩下的資料裡最早的一筆
update units u
   set first_seen_at = r.first_at
  from (select unit_id, min(observed_at) as first_at from readings group by unit_id) r
 where r.unit_id = u.id
   and u.first_seen_at < r.first_at;

-- 檢查：最早的資料時間應該是 2026-11-12 10:10
select min(observed_at) as 最早的資料時間, count(*) as 資料筆數 from readings;
