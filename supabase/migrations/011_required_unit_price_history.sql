-- =====================================================================
-- 011：補齊歷年的「應有單價」（2015 年起每一場電價費率審議會）
--
-- 原本只有 2 場（114 年下半年、115 年下半年），這次從能源署「電價費率審議會」
-- 各場會議資料裡台電的簡報「公用售電業電價費率檢討方案」逐場讀出來，共 23 場。
--
-- 新增一個欄位 is_derived（推算）：
--   112 年上半年～113 年下半年這 4 場，台電簡報和會議紀錄都沒有寫應有單價（2026-11 逐頁核對過），
--   只列出成本合計和售電量，所以用「合計成本 ÷ 售電量」算出來（四捨五入到小數第 4 位）：
--     112 上半年  10,614.71 億元 ÷ 2,397.07 億度 = 4.4282
--     112 下半年   9,396.58 億元 ÷ 2,346.54 億度 = 4.0044
--     113 上半年   9,776.09 億元 ÷ 2,372.81 億度 = 4.1200
--     113 下半年   9,380.85 億元 ÷ 2,377.70 億度 = 3.9453
--   用的是四捨五入後的數字，和官方值可能差 0.0001。
--
-- 其他說明：
--   - 2017（106 年）的兩場審議會是在討論新的電價公式，沒有提報應有單價，所以沒有這兩年的資料。
--   - 107 年兩場有「原提報版」和「調整後／核定版」，這裡放審議會最後採用的版本：
--     107 上半年 2.8097（原提報 2.9195）、107 下半年 2.8409（原提報 2.8634）。
--   - base_price（基準電價）只放簡報上有寫的；沒寫的是空值，不自己補。
--
-- 使用方式：整份複製，貼到 SQL Editor（下拉選單選 Database），按 Run。重複執行沒關係。
-- =====================================================================

alter table required_unit_prices
  add column if not exists is_derived boolean not null default false;   -- true：推算值（見上方說明）

insert into required_unit_prices
  (meeting_date, period_label_zh, period_label_en, required_price, base_price, is_derived, source_url) values
  ('2015-03-20', '104 年上半年', 'H1 2015', 2.8852, 3.1139, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=654256500123766033'),
  ('2015-09-08', '104 年下半年', 'H2 2015', 2.8556, 2.8852, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=654736566347227506'),
  ('2016-03-15', '105 年上半年', 'H1 2016', 2.5488, 2.8181, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=707515511677601226'),
  ('2016-09-13', '105 年下半年', 'H2 2016', 2.5464, 2.5488, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=711274433374174126'),
  ('2018-03-16', '107 年上半年', 'H1 2018', 2.8097, 2.5488, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1000411021715671654'),
  ('2018-09-13', '107 年下半年', 'H2 2018', 2.8409, 2.6253, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1002152650521506314'),
  ('2019-03-18', '108 年上半年', 'H1 2019', 2.7955, 2.6253, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1002152650444115067'),
  ('2019-09-18', '108 年下半年', 'H2 2019', 2.8680, 2.6253, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1036513434407401527'),
  ('2020-03-18', '109 年上半年', 'H1 2020', 2.6733, 2.6253, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1071270720166675566'),
  ('2020-09-14', '109 年下半年', 'H2 2020', 2.6300, 2.6253, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1073027623501764016'),
  ('2021-03-26', '110 年上半年', 'H1 2021', 2.6271, 2.6253, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1125775742046261160'),
  ('2021-09-23', '110 年下半年', 'H2 2021', 2.6568, 2.6253, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1127553313177006650'),
  ('2022-03-29', '111 年上半年', 'H1 2022', 3.1608, 2.6253, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1162335057245253757'),
  ('2022-06-27', '111 年臨時會', '2022 extraordinary', 3.9465, null, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1163223057362250701'),
  ('2022-09-19', '111 年下半年', 'H2 2022', 3.9805, null, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1163726112555134702'),
  ('2023-03-17', '112 年上半年', 'H1 2023', 4.4282, null, true,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1216502065524400334'),
  ('2023-09-19', '112 年下半年', 'H2 2023', 4.0044, null, true,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1220254466010603346'),
  ('2024-03-22', '113 年上半年', 'H1 2024', 4.1200, 3.1154, true,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1253205560621161710'),
  ('2024-09-30', '113 年下半年', 'H2 2024', 3.9453, null, true,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1254771027732233206'),
  ('2025-03-28', '114 年上半年', 'H1 2025', 4.0968, 3.7556, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1307554135571366246'),
  ('2025-09-19', '114 年下半年', 'H2 2025', 3.9980, 3.7556, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1311310157353757160'),
  ('2026-03-27', '115 年上半年', 'H1 2026', 3.8501, null, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1344101143167705157'),
  ('2026-09-18', '115 年下半年', 'H2 2026', 4.2675, null, false,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1345636526557601341')
on conflict (meeting_date) do update
  set period_label_zh = excluded.period_label_zh, period_label_en = excluded.period_label_en,
      required_price = excluded.required_price, base_price = excluded.base_price,
      is_derived = excluded.is_derived, source_url = excluded.source_url;


-- api_price()：和 010 一樣，只是應有單價多回傳 is_derived
create or replace function api_price()
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'avg_unit_prices', coalesce((select jsonb_agg(jsonb_build_object(
        'year', year, 'category', category, 'price', price) order by year, category)
        from avg_unit_prices), '[]'::jsonb),
    'unit_costs', coalesce((select jsonb_agg(jsonb_build_object(
        'year', year, 'cost', cost, 'avg_price', avg_price, 'decimals', decimals,
        'period_note_zh', period_note_zh, 'period_note_en', period_note_en,
        'source_zh', source_zh, 'source_en', source_en, 'source_url', source_url) order by year)
        from unit_costs), '[]'::jsonb),
    'adjustments', coalesce((select jsonb_agg(jsonb_build_object(
        'effective_date', effective_date, 'decision', decision, 'change_pct', change_pct,
        'avg_price_after', avg_price_after, 'avg_price_is_derived', avg_price_is_derived,
        'summary_zh', summary_zh, 'summary_en', summary_en,
        'announcement_url', announcement_url) order by effective_date)
        from price_adjustments), '[]'::jsonb),
    'required', coalesce((select jsonb_agg(jsonb_build_object(
        'meeting_date', meeting_date, 'period_label_zh', period_label_zh, 'period_label_en', period_label_en,
        'required_price', required_price, 'base_price', base_price, 'is_derived', is_derived,
        'source_url', source_url) order by meeting_date)
        from required_unit_prices), '[]'::jsonb)
  );
$$;

revoke execute on function api_price() from public;
grant  execute on function api_price() to anon, authenticated, service_role;


-- 檢查：應該是 23 筆、其中 4 筆推算
select count(*) as 應有單價, count(*) filter (where is_derived) as 推算
  from required_unit_prices;
