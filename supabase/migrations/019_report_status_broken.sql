-- =====================================================================
-- 019：年報、月報表格新增「連結失效」狀態，並讓「整家公司」的列可以不填年份
--
-- 為什麼：
--   1. 使用者抽查雲端檔案時，有的連結打不開或要登入。原本只有「找到／只有頁面／找不到」三種狀態，
--      新增 broken（連結失效）：網址留在資料庫做紀錄，網站上顯示「連結失效」、不放「開啟」連結。
--   2. 有些「找不到」是某一份報告（例如官網放錯檔案），有些是整家公司都找不到。
--      整家公司的列以後 year、month 都留空，網站才分得出來（以前用 2025 年當佔位，容易誤會）。
-- 做了什麼：
--   - company_reports.status 可以填 found／page_only／not_found／broken
--   - company_reports.year 可以是空值
--
-- 使用方式：整份複製（不是只複製檔名），在 SQL Editor 開新分頁貼上（下拉選單選 Database），按 Run。
--   執行完再執行 017_company_reports.sql 匯入新資料。重複執行沒關係。
-- =====================================================================

alter table company_reports drop constraint if exists company_reports_status_check;
alter table company_reports add constraint company_reports_status_check
  check (status in ('found', 'page_only', 'not_found', 'broken'));

alter table company_reports alter column year drop not null;

-- 檢查：應該看到 status 的檢查條件包含 broken，year 的 is_nullable 是 YES
select pg_get_constraintdef(oid) as 狀態檢查條件
  from pg_constraint where conname = 'company_reports_status_check';
select column_name, is_nullable from information_schema.columns
 where table_name = 'company_reports' and column_name = 'year';
