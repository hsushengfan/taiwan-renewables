-- =====================================================================
-- 016：每月自動抓 T-REC 憑證資料（Edge Function trec-sync）
--
-- 為什麼：業者排名用的 T-REC 資料每月會更新，也會補發、補登去年的資料，所以每月重抓今年和去年。
--
-- 做了什麼：新增排程 trec-sync-monthly，每月 15 日台北時間 03:17 呼叫 Edge Function trec-sync。
--   pg_cron 的時間是 UTC，比台北慢 8 小時：台北 15 日 03:17 ＝ UTC 14 日 19:17。
--   網址和金鑰沿用 002 存在 Vault 的 project_url、anon_key（不用重新設定）。
--
-- 使用方式：
--   1. 先部署 Edge Function trec-sync（見 docs/supabase-setup.md 的「業者排名的 T-REC 資料」）。
--   2. 整份複製（不是只複製檔名），在 SQL Editor 開新分頁貼上（下拉選單選 Database），按 Run。
--   重複執行沒關係：同名的排程會被覆蓋，不會重複。
-- =====================================================================

select cron.schedule(
  'trec-sync-monthly',
  '17 19 14 * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/trec-sync',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' ||
                   (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- trec_sync_runs 只保留最近 3 年（每月一筆，資料量很小，清理只是保險）
select cron.schedule(
  'cleanup-trec-sync-runs',
  '27 19 14 * *',
  $$ delete from trec_sync_runs where run_at < now() - interval '3 years'; $$
);


-- 檢查：應該看到 trec-sync-monthly（17 19 14 * *）和 cleanup-trec-sync-runs
select jobname as 排程名稱, schedule as 時間_UTC, active as 啟用 from cron.job
 where jobname in ('trec-sync-monthly', 'cleanup-trec-sync-runs');
