-- =====================================================================
-- 014：轉供費率統一以台電公告為準，拿掉逐列的「換算」標記
--
-- 為什麼：2019～2026 年每一年都有台電「輸配電業各項費率方案」公告原檔了。
--   原本有些列抄自能源署公布的未稅數字（沒標「換算」），有些列是從台電公告 ÷ 1.05 換算（標「換算」），
--   但兩者的數字其實一樣，逐列標記只會讓人誤以為某些年份比較不準。
--   所以統一成一條規則：未稅＝台電公告值 ÷ 1.05（四捨五入到小數第 4 位），
--   合計＝四項公告值加總 ÷ 1.05。網站改成一句統一的說明。
--
-- 這次做的事：
--   1. 4 筆合計照上面的規則重算（原本是能源署公布的合計，差在四捨五入 0.0001）：
--        2021 平均費率 0.6488 → 0.6487（公告 0.0613+0.1101+0.1940+0.3157＝0.6811，÷1.05）
--        2025 平均費率 0.8465 → 0.8464（公告 0.0617+0.1812+0.2102+0.4356＝0.8887，÷1.05）
--        2026 平均費率 0.7457 → 0.7458（公告 0.0728+0.0686+0.1946+0.4471＝0.7831，÷1.05）
--        2026 再生能源（不排碳）0.3052 → 0.3051（公告 0.0364+0.0274+0.0778+0.1788＝0.3204，÷1.05）
--   2. 所有列的來源統一寫「台電輸配電業各項費率方案公告」。
--   3. 刪掉 is_derived 欄位（現在每一列的算法都一樣，不需要逐列標記）。
--
-- 使用方式：整份複製（不是只複製檔名），在 SQL Editor 開新分頁貼上（下拉選單選 Database），按 Run。
-- 重複執行沒關係。
-- =====================================================================

-- 1. 4 筆合計重算
update wheeling_rates set total = 0.6487 where year = 2021 and fuel_type = 'average';
update wheeling_rates set total = 0.8464 where year = 2025 and fuel_type = 'average';
update wheeling_rates set total = 0.7458 where year = 2026 and fuel_type = 'average';
update wheeling_rates set total = 0.3051 where year = 2026 and fuel_type = 're_zero_carbon';

-- 2. 來源統一
update wheeling_rates
   set source_zh  = '台電輸配電業各項費率方案公告',
       source_en  = 'Taipower announcement of transmission and distribution rates',
       source_url = 'https://www.taipower.com.tw/2289/2558/49405/49414/nodeList';

-- 3. 先把 api_wheeling() 改成不讀 is_derived，再刪掉這個欄位
create or replace function api_wheeling()
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'rates', coalesce((select jsonb_agg(jsonb_build_object(
        'year', year, 'fuel_type', fuel_type,
        'ancillary', ancillary, 'dispatch', dispatch, 'transmission', transmission,
        'distribution', distribution, 'total', total,
        'source_zh', source_zh, 'source_en', source_en, 'source_url', source_url) order by fuel_type, year)
        from wheeling_rates), '[]'::jsonb),
    'docs', coalesce((select jsonb_agg(jsonb_build_object(
        'year', year, 'announced_on', announced_on, 'doc_no', doc_no, 'pdf_path', pdf_path) order by year)
        from wheeling_rate_docs), '[]'::jsonb)
  );
$$;

revoke execute on function api_wheeling() from public;
grant  execute on function api_wheeling() to anon, authenticated, service_role;

alter table wheeling_rates drop column if exists is_derived;


-- 檢查：應該只有 1 種來源、64 筆；4 筆合計是 0.6487、0.8464、0.7458、0.3051
select source_zh as 來源, count(*) as 筆數,
       (select string_agg(total::text, '、' order by year, fuel_type) from wheeling_rates
         where (year, fuel_type) in ((2021,'average'),(2025,'average'),(2026,'average'),(2026,'re_zero_carbon'))) as 重算的合計
  from wheeling_rates group by source_zh;
