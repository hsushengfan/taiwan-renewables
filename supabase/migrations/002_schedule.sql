-- =====================================================================
-- 排程：讓 Supabase 每 3 分鐘自動呼叫 Edge Function「collect」
--
-- 使用方式：
--   1. 把下面兩個「請貼上…」換成你的 Project URL 和 anon key
--      （在 Project Settings → API Keys → Legacy API Keys 的 anon public）
--   2. 整份貼到 SQL Editor（下拉選單要選 Database），按 Run
-- 重複執行沒關係：金鑰會被更新、排程會被覆蓋，不會變成兩份。
--
-- anon key 本來就是設計成「可以公開」的金鑰（網站前端也會用到），
-- 它只能呼叫 Edge Function，沒辦法直接讀寫資料表（因為 RLS 擋住了）。
-- =====================================================================


-- pg_cron：資料庫內建的鬧鐘。pg_net：讓資料庫可以發 HTTP 請求。
create extension if not exists pg_cron;
create extension if not exists pg_net;


-- 把網址和金鑰放進 Vault（保險箱），排程從這裡讀，不用寫死在排程裡
do $$
declare
  v_url text := '請貼上 Project URL，例如 https://abcdefgh.supabase.co';
  v_key text := '請貼上 anon key（eyJ 開頭）';
begin
  if v_url like '請貼上%' or v_key like '請貼上%' then
    raise exception '請先把 Project URL 和 anon key 換成你自己的';
  end if;

  if exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'project_url'), rtrim(v_url, '/'));
  else
    perform vault.create_secret(rtrim(v_url, '/'), 'project_url');
  end if;

  if exists (select 1 from vault.secrets where name = 'anon_key') then
    perform vault.update_secret((select id from vault.secrets where name = 'anon_key'), v_key);
  else
    perform vault.create_secret(v_key, 'anon_key');
  end if;
end $$;


-- 每 3 分鐘呼叫一次 collect
-- （同名的排程再執行一次會被覆蓋，不會重複）
select cron.schedule(
  'collect-taipower',
  '*/3 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/collect',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' ||
                   (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);


-- 每天清理舊紀錄，避免佔空間：
--   collection_runs 保留 90 天；pg_cron 自己的執行紀錄保留 7 天。
-- pg_cron 的時間是 UTC：19:07 UTC = 台灣時間 03:07。
select cron.schedule(
  'cleanup-logs',
  '7 19 * * *',
  $$
  delete from public.collection_runs where run_at < now() - interval '90 days';
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  $$
);
