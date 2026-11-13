-- =====================================================================
-- 移除 availability（可用率）
--
-- 原因：台電只提供「裝置容量」和「實際發電量」，沒有「實際可用的容量」，
-- 真正的 availability 算不出來。詳見 docs/methodology.md。
--
-- 這個檔案給「已經執行過舊版 001、003」的資料庫升級用。
-- 使用方式：整份複製，貼到 SQL Editor（下拉選單選 Database），按 Run。
-- 重複執行沒關係。全新安裝的資料庫執行它也不會有問題。
--
-- 不會動到原始資料：readings 裡的發電量、裝置容量、備註、狀態代碼都保留。
-- =====================================================================


-- 1. 先移除舊的 view（它用到了等一下要刪掉的欄位）
drop view if exists readings_evaluated;


-- 2. statuses：把「availability 怎麼算」換成「要不要列入容量因數的計算」
alter table statuses add column if not exists excluded_from_stats boolean not null default false;
update statuses set excluded_from_stats = (id in (5, 6));   -- 狀態不明、試運轉
alter table statuses drop column if exists availability_rule;


-- 3. daily_unit_stats：移除 availability 欄位
alter table daily_unit_stats drop column if exists availability;


-- 4. 重建 view 和計算函式（內容和 003_daily_stats.sql 一樣）

-- ---------------------------------------------------------------------
-- readings_evaluated：每一筆發電紀錄，加上「這 10 分鐘的容量因數」
--
--   容量因數 = 發電量 ÷ 裝置容量，限制在 0% ~ 100% 之間
--   以下情況算不出來，留空值：
--     沒有裝置容量；沒有發電量數字；
--     狀態是「不列入計算」（試運轉、通訊異常）
-- ---------------------------------------------------------------------
create or replace view readings_evaluated
with (security_invoker = true) as
select r.observed_at,
       r.unit_id,
       r.capacity_mw,
       r.output_mw,
       r.status_id,
       r.remark,
       s.flagged,
       case
         when r.capacity_mw is null or r.capacity_mw <= 0 then null
         when s.excluded_from_stats then null
         when r.output_mw is null then null
         else least(1.0, greatest(0.0, r.output_mw::float8 / r.capacity_mw))
       end as capacity_factor
  from readings r
  join statuses s on s.id = r.status_id;


-- ---------------------------------------------------------------------
-- refresh_daily_stats(某一天)：重新計算那一天全部機組的彙總
-- 用法：select refresh_daily_stats('2026-11-12');
-- 回傳：那一天有幾個機組
-- ---------------------------------------------------------------------
create or replace function refresh_daily_stats(p_day date)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_start timestamptz := p_day::timestamp at time zone 'Asia/Taipei';
  v_end   timestamptz := (p_day + 1)::timestamp at time zone 'Asia/Taipei';
  v_count int;
begin
  delete from daily_unit_stats where day = p_day;

  with day_rows as (
    select * from readings_evaluated
     where observed_at >= v_start and observed_at < v_end
  ),
  flagged_counts as (
    select unit_id, jsonb_object_agg(remark, n) as remarks
      from (select unit_id, remark, count(*) as n
              from day_rows where flagged
             group by unit_id, remark) x
     group by unit_id
  )
  insert into daily_unit_stats
        (day, unit_id, generation_kwh, capacity_factor, capacity_mw,
         intervals_present, intervals_valid, completeness, flagged_remarks)
  select p_day,
         d.unit_id,
         avg(d.output_mw::float8) * 24 * 1000,
         avg(d.capacity_factor),
         (array_agg(d.capacity_mw order by d.observed_at desc))[1],
         count(*),
         count(d.capacity_factor),
         count(*) / 144.0,
         coalesce(f.remarks, '{}'::jsonb)
    from day_rows d
    left join flagged_counts f on f.unit_id = d.unit_id
   group by d.unit_id, f.remarks;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function refresh_daily_stats(date) from public, anon, authenticated;
grant  execute on function refresh_daily_stats(date) to service_role;


-- 把目前已經有資料的每一天都算一次
select refresh_daily_stats(d)
  from (select distinct (observed_at at time zone 'Asia/Taipei')::date as d from readings) days
 order by d;
