-- =====================================================================
-- 備註直接顯示原文
--
-- 「合約限制」、「計劃停機」、「環保檢測」不再顯示成「未知備註」：
--   1. 狀態 7 改名為「其他備註」（Other remark）
--   2. 這三種備註加進規則表，歸為狀態 7，並補上英文翻譯
--   3. api_unit_series 多回傳每個時間點的備註原文，網站的狀態色帶可以直接顯示
--
-- 計算方式不變：狀態 7 原本就列入容量因數的計算，也會被標註。
--
-- 使用方式：整份複製，貼到 SQL Editor（下拉選單選 Database），按 Run。
-- 重複執行沒關係。要先執行過 001 ~ 005。
-- =====================================================================


-- 1. 狀態 7 改名
update statuses set name = '其他備註', name_en = 'Other remark' where id = 7;


-- 2. 三種備註加進規則表（舊資料會由觸發器自動重新分類，結果仍是 7）
insert into remark_rules (remark, status_id) values
  ('合約限制', 7),
  ('計劃停機', 7),
  ('環保檢測', 7)
on conflict (remark) do update set status_id = excluded.status_id;

update remark_rules r set remark_en = v.remark_en
  from (values
    ('合約限制', 'Contract limit'),
    ('計劃停機', 'Planned outage'),
    ('環保檢測', 'Environmental testing')
  ) as v(remark, remark_en)
 where r.remark = v.remark;


-- 3. api_unit_series：每個機組多回傳 "remark"（每個時間點的備註原文，沒有備註是空字串）
--    回傳 {"times": [...], "units": {"機組編號": {"output": [...], "status": [...], "remark": [...]}}}
create or replace function api_unit_series(
  p_from        timestamptz,
  p_to          timestamptz,
  p_category_id smallint default null,
  p_unit_id     smallint default null)
returns jsonb
language plpgsql stable
security definer
set search_path = public
set timezone = 'Asia/Taipei'
as $$
declare
  v_result jsonb;
begin
  if p_category_id is null and p_unit_id is null then
    raise exception 'p_category_id 和 p_unit_id 至少要給一個';
  end if;
  if p_to - p_from > interval '8 days' then
    raise exception '時間範圍太長：最多 8 天';
  end if;

  with t as (
    select distinct observed_at as t from category_readings
     where observed_at >= p_from and observed_at < p_to
  ),
  picked as (
    select id from units
     where (p_category_id is null or category_id = p_category_id)
       and (p_unit_id is null or id = p_unit_id)
  )
  select jsonb_build_object(
    'times', coalesce((select jsonb_agg(t order by t) from t), '[]'::jsonb),
    'units', coalesce((
      select jsonb_object_agg(unit_id, s) from (
        select p.id as unit_id,
               jsonb_build_object(
                 'output', jsonb_agg(r.output_mw order by t.t),
                 'status', jsonb_agg(coalesce(r.status_id, 0) order by t.t),
                 'remark', jsonb_agg(coalesce(r.remark, '') order by t.t)) as s
          from picked p
         cross join t
          left join readings r on r.unit_id = p.id and r.observed_at = t.t
         group by p.id) x), '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;


revoke execute on function api_unit_series(timestamptz, timestamptz, smallint, smallint) from public;
grant  execute on function api_unit_series(timestamptz, timestamptz, smallint, smallint) to anon, authenticated, service_role;
