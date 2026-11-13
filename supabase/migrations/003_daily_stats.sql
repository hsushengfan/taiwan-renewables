-- =====================================================================
-- 每日彙總：每個機組每天的發電量、容量因數、資料完整度
--
-- 使用方式：整份複製，貼到 SQL Editor（下拉選單選 Database），按 Run。
-- 重複執行沒關係。
--
-- 計算方式和 capacity_factor.py 的 evaluate() 完全一樣，說明見 docs/methodology.md。
-- 這張表完全由 readings 算出來：算錯了或規則改了，重算就好，不會弄壞原始資料。
-- =====================================================================


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
-- daily_unit_stats：每個機組每天一列
-- ---------------------------------------------------------------------
create table if not exists daily_unit_stats (
  day               date not null,          -- 日期（台灣時間）
  unit_id           smallint not null references units (id),
  generation_kwh    float8,                 -- 發電量（度）= 平均淨發電量(MW) × 24 小時 × 1000
  capacity_factor   float8,                 -- 當天每 10 分鐘容量因數的平均；算不出來就是空值
  capacity_mw       real,                   -- 當天最後一筆的裝置容量
  intervals_present smallint not null,      -- 當天收到幾個時間點（最多 144）
  intervals_valid   smallint not null,      -- 其中能算容量因數的有幾個
  completeness      real not null,          -- 資料完整度 = intervals_present ÷ 144
  flagged_remarks   jsonb not null default '{}',  -- 例如 {"部分檢修": 12, "檢修": 3}
  computed_at       timestamptz not null default now(),
  primary key (day, unit_id)
);

alter table daily_unit_stats enable row level security;


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


-- ---- 以下是排程（需要 pg_cron）----
-- 每小時的第 20 分，重算「今天」和「昨天」。
--   今天：讓網站可以顯示今天到目前為止的數字
--   昨天：台電資料會晚 10 幾分鐘，昨天最後幾筆可能過了午夜才進來，所以再算一次
select cron.schedule(
  'refresh-daily-stats',
  '20 * * * *',
  $$
  select public.refresh_daily_stats((now() at time zone 'Asia/Taipei')::date);
  select public.refresh_daily_stats((now() at time zone 'Asia/Taipei')::date - 1);
  $$
);
