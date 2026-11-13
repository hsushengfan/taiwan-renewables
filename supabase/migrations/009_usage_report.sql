-- =====================================================================
-- 用量檢查：每天記錄一次資料庫和 Storage 的用量
--
-- 免費方案的上限：資料庫 500 MB、Storage 1 GB（以 Supabase 官網為準；改方案時改下面的預設值）。
-- 每天由 pg_cron 呼叫 Edge Function「usage-report」，它會：
--   - 呼叫 record_usage() 記錄今天的用量
--   - 每月 1 號寄一封用量報告
--   - 用量第一次超過 70%、85%、95% 時，馬上寄警告信
--
-- 使用方式：整份複製，貼到 SQL Editor（下拉選單選 Database），按 Run。
-- 要先部署 Edge Function「usage-report」。重複執行沒關係。
-- =====================================================================


-- usage_checks：每天一筆用量紀錄（也用來估算每天長多少）
create table if not exists usage_checks (
  checked_at    timestamptz primary key default now(),
  db_bytes      bigint not null,      -- 資料庫大小（bytes）
  storage_bytes bigint not null,      -- Storage 裡所有檔案的大小（bytes）
  alert_level   smallint not null     -- 0：低於 70%；1：70% 以上；2：85% 以上；3：95% 以上
);

alter table usage_checks enable row level security;


-- record_usage()：量一次用量、存一筆紀錄，回傳寄信需要的數字
--   prev_level 是上一次檢查的警告等級：這次的等級比上次高，就代表「第一次超過」某個門檻，要寄警告信。
--   db_growth_per_day：用最近 30 天的紀錄估算每天長多少（紀錄少於 3 天時是空值）。
create or replace function record_usage(p_db_limit_mb int default 500, p_storage_limit_mb int default 1024)
returns jsonb
language plpgsql
security definer          -- 用資料庫擁有者的權限，才讀得到 Storage 的檔案清單
set search_path = public
as $$
declare
  v_db        bigint := pg_database_size(current_database());
  v_storage   bigint := coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects), 0);
  v_db_limit  bigint := p_db_limit_mb::bigint * 1024 * 1024;
  v_st_limit  bigint := p_storage_limit_mb::bigint * 1024 * 1024;
  v_pct       float8;
  v_level     smallint;
  v_prev      smallint;
  v_first_at  timestamptz;
  v_first_db  bigint;
  v_growth    float8;
begin
  v_pct := greatest(v_db::float8 / v_db_limit, v_storage::float8 / v_st_limit);
  v_level := case when v_pct >= 0.95 then 3 when v_pct >= 0.85 then 2 when v_pct >= 0.70 then 1 else 0 end;

  select alert_level into v_prev from usage_checks order by checked_at desc limit 1;
  select checked_at, db_bytes into v_first_at, v_first_db
    from usage_checks where checked_at > now() - interval '30 days' order by checked_at limit 1;

  insert into usage_checks (db_bytes, storage_bytes, alert_level) values (v_db, v_storage, v_level);

  if v_first_at is not null and now() - v_first_at > interval '3 days' then
    v_growth := (v_db - v_first_db) / (extract(epoch from now() - v_first_at) / 86400);
  end if;

  return jsonb_build_object(
    'db_bytes', v_db, 'db_limit_bytes', v_db_limit,
    'storage_bytes', v_storage, 'storage_limit_bytes', v_st_limit,
    'level', v_level, 'prev_level', coalesce(v_prev, 0),
    'db_growth_per_day', v_growth,
    'days_until_db_full', case when v_growth > 0 then floor((v_db_limit - v_db) / v_growth) end,
    'readings_rows', (select reltuples::bigint from pg_class where oid = 'public.readings'::regclass),
    'data_since', (select min(observed_at) from readings)
  );
end;
$$;

revoke execute on function record_usage(int, int) from public, anon, authenticated;
grant  execute on function record_usage(int, int) to service_role;


-- 每天台灣時間 09:07 檢查一次（pg_cron 的時間是 UTC：01:07 UTC = 台灣 09:07）
-- 呼叫方式和 002_schedule.sql 的收集排程一樣，網址和金鑰從 Vault 讀。
select cron.schedule(
  'usage-report',
  '7 1 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/usage-report',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' ||
                   (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
