-- =====================================================================
-- 電價與轉供費率（人工整理的資料）
--
-- 規格：docs/specs/electricity-price.md。資料都是人工整理、對照官方來源的數字，
-- 不是自動收集的；之後有新數字時，改這個檔案（或新增一個 migration）再執行一次。
--
-- 五張表：
--   avg_unit_prices       歷年平均單價（表燈非營業、表燈營業、電燈、電力、合計）
--   unit_costs            每度售電成本
--   price_adjustments     電價調整時間軸（含「不調整」、「延後」）
--   wheeling_rates        轉供（輸配電業各項）費率
--   required_unit_prices  應有單價（台電提報審議會的估計值）
-- 兩個給網站讀的函式：api_price()、api_wheeling()
--
-- 所有價格一律存「未稅」值。網站顯示含稅時才乘 1.05。
--
-- 使用方式：整份複製，貼到 SQL Editor（下拉選單選 Database），按 Run。
-- 重複執行沒關係：已經有的資料會被更新成這個檔案裡的數字。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. avg_unit_prices：歷年平均單價（元/度，未稅）
--    平均單價＝電費收入 ÷ 售電度數，是「實績」，不是電價表上的牌價。
--    來源：台電「06-歷年平均單價(91-114)」（台電官網 → 資訊揭露 → 經營實績 → 統計資料）
-- ---------------------------------------------------------------------
create table if not exists avg_unit_prices (
  year     int not null,             -- 西元年
  category text not null check (category in
             ('lamp_residential', 'lamp_business', 'lamp_total', 'power', 'total')),
             -- lamp_residential 表燈非營業（住宅）｜ lamp_business 表燈營業（小商家）
             -- lamp_total 電燈（前兩者合計）｜ power 電力（產業）｜ total 合計
  price    numeric(8,4) not null,    -- 元/度，未稅
  primary key (year, category)
);

insert into avg_unit_prices (year, category, price)
select v.year, c.category, c.price
  from (values
    (2002, 2.5366, 2.9566, 2.5801, 1.8491, 2.0945),
    (2003, 2.5084, 2.8976, 2.5443, 1.8287, 2.0682),
    (2004, 2.4925, 2.8868, 2.5319, 1.8225, 2.0520),
    (2005, 2.5091, 2.8239, 2.5283, 1.8205, 2.0533),
    (2006, 2.5718, 2.9043, 2.5933, 1.8753, 2.1046),
    (2007, 2.5855, 3.0051, 2.6286, 1.9280, 2.1484),
    (2008, 2.5840, 3.2784, 2.7008, 2.1198, 2.3010),
    (2009, 2.7343, 3.7031, 2.9100, 2.4625, 2.6070),
    (2010, 2.7606, 3.7574, 2.9532, 2.4583, 2.6098),
    (2011, 2.7568, 3.7399, 2.9428, 2.4500, 2.6001),
    (2012, 2.7189, 3.9042, 2.9673, 2.6178, 2.7222),
    (2013, 2.8624, 4.1061, 3.1165, 2.8020, 2.8945),
    (2014, 2.8530, 4.2948, 3.1710, 3.0279, 3.0705),
    (2015, 2.8409, 4.0365, 3.1012, 2.8623, 2.9331),
    (2016, 2.5679, 3.6118, 2.7914, 2.5405, 2.6159),
    (2017, 2.4793, 3.4994, 2.7058, 2.4782, 2.5454),
    (2018, 2.5217, 3.5246, 2.7540, 2.5383, 2.6008),
    (2019, 2.5256, 3.5101, 2.7570, 2.5624, 2.6190),
    (2020, 2.5596, 3.4325, 2.7576, 2.5320, 2.5986),
    (2021, 2.5110, 3.4290, 2.7190, 2.5345, 2.5885),
    (2022, 2.5571, 3.4323, 2.7621, 2.7095, 2.7246),
    (2023, 2.6048, 3.5454, 2.8301, 3.1749, 3.0727),
    (2024, 2.7431, 3.7981, 3.0030, 3.6874, 3.4826),
    (2025, 2.8187, 3.9149, 3.1167, 4.2289, 3.8958)
  ) as v(year, residential, business, lamp, power, total)
  cross join lateral (values
    ('lamp_residential', v.residential), ('lamp_business', v.business),
    ('lamp_total', v.lamp), ('power', v.power), ('total', v.total)
  ) as c(category, price)
on conflict (year, category) do update set price = excluded.price;


-- ---------------------------------------------------------------------
-- 2. unit_costs：每度售電成本（元/度）
--    由三個官方來源拼接，各年來源不同。
--    decimals：原始資料有幾位小數（2023 年只有 2 位），網站照這個位數顯示，不補零。
--    成本沒有「含稅」的概念，網站切換含稅時不會變。
-- ---------------------------------------------------------------------
create table if not exists unit_costs (
  year           int primary key,
  cost           numeric not null,          -- 每度售電成本，元/度（不限制小數位數，才能保留原始精度）
  avg_price      numeric,                   -- 同一來源的每度平均電價（未稅），可為空值
  decimals       smallint not null default 4,
  period_note_zh text not null default '',  -- 例如「1–9 月，未經審定」
  period_note_en text not null default '',
  source_zh      text not null,
  source_en      text not null,
  source_url     text                       -- 沒有網址的來源是空值
);

insert into unit_costs (year, cost, avg_price, decimals, period_note_zh, period_note_en, source_zh, source_en, source_url) values
  (2017, 2.5027, null,   4, '', '', '立法院預算中心', 'Legislative Yuan Budget Center', null),
  (2018, 2.6554, null,   4, '', '', '立法院預算中心', 'Legislative Yuan Budget Center', null),
  (2019, 2.7201, 2.6190, 4, '', '', '立法院預算中心', 'Legislative Yuan Budget Center', null),
  (2020, 2.4653, 2.5986, 4, '', '', '立法院預算中心', 'Legislative Yuan Budget Center', null),
  (2021, 2.4646, 2.5885, 4, '', '', '立法院預算中心', 'Legislative Yuan Budget Center', null),
  (2022, 3.8985, null,   4, '', '', '立法院預算中心', 'Legislative Yuan Budget Center', null),
  (2023, 4.17,   3.07,   2, '僅 2 位小數；計入政府撥補後為 3.95', 'Two decimal places only; 3.95 after the government subsidy',
                            '監察院報告', 'Control Yuan report', null),
  (2024, 3.7036, 3.4827, 4, '審定決算', 'Audited final accounts',
                            '台電「電價及單位成本結構比較」', 'Taipower, "Comparison of electricity price and unit cost structure"',
                            'https://www.taipower.com.tw/2289/2363/2373/2375/10358/normalPost'),
  (2025, 3.6432, 3.9020, 4, '審定決算', 'Audited final accounts',
                            '台電「電價及單位成本結構比較」', 'Taipower, "Comparison of electricity price and unit cost structure"',
                            'https://www.taipower.com.tw/2289/2363/2373/2375/10358/normalPost'),
  (2026, 4.1007, 3.9674, 4, '1–9 月，未經審定', 'January–September, unaudited',
                            '台電「電價及單位成本結構比較」', 'Taipower, "Comparison of electricity price and unit cost structure"',
                            'https://www.taipower.com.tw/2289/2363/2373/2375/10358/normalPost')
on conflict (year) do update
  set cost = excluded.cost, avg_price = excluded.avg_price, decimals = excluded.decimals,
      period_note_zh = excluded.period_note_zh, period_note_en = excluded.period_note_en,
      source_zh = excluded.source_zh, source_en = excluded.source_en, source_url = excluded.source_url;


-- ---------------------------------------------------------------------
-- 3. price_adjustments：電價調整時間軸（2015 年起，含「不調整」與「延後」）
--    decision：increase 調漲｜decrease 調降｜freeze 不調整｜deferred 延後決定
--    change_pct：平均調幅（%）。不調整是 0。只調產業的，填產業調幅並在 summary 說明。
--    avg_price_after：調整後的全體平均電價（元/度，未稅）。
--    avg_price_is_derived：true＝官方沒公布、由我們推算的數字（網站上加註「推算」）。
--      2025-10-01 的 3.7823＝3.7556 × 1.0071（官方只寫「平均調幅 0.71%」），之後沿用它的兩列也是。
--    summary：一句話重點，可以是空字串（網站會改顯示「不調整」或調幅）。
--    announcement_url：台電公告頁（頁內附該次調整後的電價表 PDF）。
--    2017 年沒有調價（電業法修正後改用新公式），不建列，時間軸上另外標註。
-- ---------------------------------------------------------------------
create table if not exists price_adjustments (
  id                   serial primary key,
  effective_date       date not null unique,    -- 生效日；不調整者填該次審議對應的 4/1 或 10/1
  decision             text not null check (decision in ('increase', 'decrease', 'freeze', 'deferred')),
  change_pct           numeric(6,2),
  avg_price_after      numeric(8,4),
  avg_price_is_derived boolean not null default false,
  summary_zh           text not null default '',
  summary_en           text not null default '',
  announcement_url     text
);

insert into price_adjustments
  (effective_date, decision, change_pct, avg_price_after, avg_price_is_derived, summary_zh, summary_en, announcement_url) values
  ('2015-04-01', 'decrease', -7.34, 2.8852, false, '用電越省降幅越大',
     'The less electricity used, the bigger the cut',
     'https://www.taipower.com.tw/2289/2323/2338/9884/normalPost'),
  ('2015-10-01', 'decrease', -2.33, 2.8181, false, '', '',
     'https://www.taipower.com.tw/2289/2323/2338/9860/normalPost'),
  ('2016-04-01', 'decrease', -9.56, 2.5488, false, '連續第三次調降',
     'Third cut in a row',
     'https://www.taipower.com.tw/2289/2323/2338/9844/normalPost'),
  ('2016-10-01', 'freeze',    0,    2.5488, false, '下半年不調整',
     'No change for the second half of the year', null),
  ('2018-04-01', 'increase',  3.00, 2.6253, false, '住宅 500 度以下、小商家 1,500 度以下不調',
     'No change for homes using up to 500 kWh or small businesses using up to 1,500 kWh',
     'https://www.taipower.com.tw/2289/2323/2338/9916/normalPost'),
  ('2018-10-01', 'freeze',    0,    2.6253, false, '', '', null),
  ('2019-04-01', 'freeze',    0,    2.6253, false, '', '', null),
  ('2019-10-01', 'freeze',    0,    2.6253, false, '', '', null),
  ('2020-04-01', 'freeze',    0,    2.6253, false, '', '', null),
  ('2020-10-01', 'freeze',    0,    2.6253, false, '', '', null),
  ('2021-04-01', 'freeze',    0,    2.6253, false, '', '', null),
  ('2021-10-01', 'freeze',    0,    2.6253, false, '', '', null),
  ('2022-04-01', 'deferred',  0,    2.6253, false, '俄烏戰爭，待情勢明朗再議',
     'Russia–Ukraine war; decision postponed until the situation is clearer', null),
  ('2022-07-01', 'increase',  8.40, 2.8458, false, '高壓、特高壓漲 15%；住宅 1,000 度以下及小商家不漲',
     'High and extra-high voltage users +15%; homes using up to 1,000 kWh and small businesses unchanged',
     'https://www.taipower.com.tw/2289/2323/2338/10092/normalPost'),
  ('2022-10-01', 'freeze',    0,    2.8458, false, '高壓用戶夏月期間延長',
     'Summer-rate period extended for high-voltage users', null),
  ('2023-04-01', 'increase', 11.00, 3.1154, false, '高壓以上漲 17%、低壓 10%；衰退產業減半',
     'High voltage and above +17%, low voltage +10%; increase halved for industries in decline',
     'https://www.taipower.com.tw/2289/2323/2338/35028/normalPost'),
  ('2023-10-01', 'freeze',    0,    3.1154, false, '百貨、電影院、健身房、餐飲取消凍漲',
     'Price freeze lifted for department stores, cinemas, gyms and restaurants',
     'https://www.taipower.com.tw/2289/2323/2338/35046/normalPost'),
  ('2024-04-01', 'increase', 11.00, 3.4518, false, '約 11%；產業分三級，特大戶與資料中心加重，最高 25%',
     'About 11%; industry split into three tiers, with the largest users and data centres paying more, up to 25%',
     'https://www.taipower.com.tw/2289/2323/2338/45429/normalPost'),
  ('2024-10-16', 'increase', 12.50, 3.7556, false, '12.5% 是產業平均調幅；民生凍漲',
     '12.5% is the average increase for industry; households and small businesses frozen',
     'https://www.taipower.com.tw/2289/2323/2338/59160/normalPost'),
  ('2025-04-01', 'freeze',    0,    3.7556, false, '', '', null),
  ('2025-10-01', 'increase',  0.71, 3.7823, true,  '住宅與小商家微調，產業不調',
     'Small increase for homes and small businesses; industry unchanged',
     'https://www.taipower.com.tw/2289/2323/2338/64586/normalPost'),
  ('2026-04-01', 'freeze',    0,    3.7823, true,  '', '', null),
  ('2026-10-01', 'deferred',  0,    3.7823, true,  '暫不決定，留待 12 月審議會，最快 2027/1 調整',
     'No decision yet; left to the December review, with any change from January 2027 at the earliest', null)
on conflict (effective_date) do update
  set decision = excluded.decision, change_pct = excluded.change_pct,
      avg_price_after = excluded.avg_price_after, avg_price_is_derived = excluded.avg_price_is_derived,
      summary_zh = excluded.summary_zh, summary_en = excluded.summary_en,
      announcement_url = excluded.announcement_url;


-- ---------------------------------------------------------------------
-- 4. wheeling_rates：轉供（輸配電業各項）費率（元/度，未稅）
--    fuel_type：average 平均費率｜re_zero_carbon 再生能源（不排碳）
--    查不到的欄位是空值；查不到的年份不建列（不要內插補）。
--    is_derived：true＝官方公告的是含稅值，這裡是 ÷ 1.05 的換算值
--      （2026 年；合計用審議會公布的未稅合計）。
--    來源：能源署電價及費率審議資訊揭露專區 → 輸配電業各項費率
-- ---------------------------------------------------------------------
create table if not exists wheeling_rates (
  year         int not null,          -- 適用年度（西元）
  fuel_type    text not null check (fuel_type in ('average', 're_zero_carbon')),
  ancillary    numeric(8,4),          -- 輔助服務
  dispatch     numeric(8,4),          -- 電力調度
  transmission numeric(8,4),          -- 轉供輸電
  distribution numeric(8,4),          -- 轉供配電
  total        numeric(8,4),          -- 四項合計
  is_derived   boolean not null default false,
  source_zh    text not null,
  source_en    text not null,
  source_url   text,
  primary key (year, fuel_type)
);

insert into wheeling_rates (year, fuel_type, ancillary, dispatch, transmission, distribution, total, is_derived, source_zh, source_en, source_url)
select v.year, v.fuel_type, v.ancillary, v.dispatch, v.transmission, v.distribution, v.total, v.is_derived,
       '能源署電價及費率審議資訊揭露專區', 'Energy Administration, electricity price and rate review disclosures',
       'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?MmmID=654246034164516080'
  from (values
    (2018, 'average',        0.0483, 0.0842, 0.2272, 0.3544, 0.7141, false),
    (2019, 'average',        0.0473, 0.0816, 0.2080, 0.3243, 0.6612, false),
    (2020, 'average',        0.0499, 0.0911, 0.2024, 0.3168, 0.6602, false),
    (2021, 'average',        0.0584, 0.1049, 0.1848, 0.3007, 0.6488, false),
    (2022, 'average',        0.0474, 0.0849, 0.1701, 0.3193, 0.6217, false),
    (2023, 'average',        0.0394, 0.0759, 0.1743, 0.3240, 0.6136, false),
    (2024, 'average',        0.0300, 0.1933, 0.1659, 0.3318, 0.7210, false),
    (2025, 'average',        0.0588, 0.1726, 0.2002, 0.4149, 0.8465, false),
    (2026, 'average',        0.0693, 0.0653, 0.1853, 0.4258, 0.7457, true),
    (2019, 're_zero_carbon', 0.0236, 0.0041, 0.0104, 0.0162, 0.0543, false),
    (2020, 're_zero_carbon', 0.0250, 0.0046, 0.0101, 0.0158, 0.0555, false),
    (2022, 're_zero_carbon', 0.0237, 0.0042, 0.0085, 0.0160, 0.0524, false),
    (2023, 're_zero_carbon', 0.0197, 0.0190, 0.0436, 0.0810, 0.1633, false),
    (2025, 're_zero_carbon', null,   null,   null,   null,   0.2658, false),
    (2026, 're_zero_carbon', 0.0347, 0.0261, 0.0741, 0.1703, 0.3052, true)
  ) as v(year, fuel_type, ancillary, dispatch, transmission, distribution, total, is_derived)
on conflict (year, fuel_type) do update
  set ancillary = excluded.ancillary, dispatch = excluded.dispatch, transmission = excluded.transmission,
      distribution = excluded.distribution, total = excluded.total, is_derived = excluded.is_derived,
      source_zh = excluded.source_zh, source_en = excluded.source_en, source_url = excluded.source_url;


-- ---------------------------------------------------------------------
-- 5. required_unit_prices：應有單價（元/度，未稅）
--    台電依電價公式估算、足以反映成本與合理利潤的電價水準，是提報審議會的估計值，不是實際電價。
--    base_price：同一頁簡報載明的基準（現行）電價，沒寫就是空值。
--    來源：各場電價費率審議會的台電簡報「公用售電業電價費率檢討方案」。
-- ---------------------------------------------------------------------
create table if not exists required_unit_prices (
  meeting_date    date primary key,     -- 審議會日期
  period_label_zh text not null,        -- 例如「114 年下半年」
  period_label_en text not null,        -- 例如「H2 2025」
  required_price  numeric(8,4) not null,
  base_price      numeric(8,4),
  source_url      text not null         -- 該場審議會的會議資料頁
);

insert into required_unit_prices (meeting_date, period_label_zh, period_label_en, required_price, base_price, source_url) values
  ('2025-09-19', '114 年下半年', 'H2 2025', 3.9980, 3.7556,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1311310157353757160'),
  ('2026-09-18', '115 年下半年', 'H2 2026', 4.2675, null,
     'https://www3.moeaea.gov.tw/ele102/Content/Messagess/contents.aspx?&MmmID=654246034164516005&MSID=1345636526557601341')
on conflict (meeting_date) do update
  set period_label_zh = excluded.period_label_zh, period_label_en = excluded.period_label_en,
      required_price = excluded.required_price, base_price = excluded.base_price, source_url = excluded.source_url;


-- ---------------------------------------------------------------------
-- 安全性：五張表都開 RLS、不給任何開放規則 → 網站讀不到資料表，只能透過下面兩個函式
-- ---------------------------------------------------------------------
alter table avg_unit_prices      enable row level security;
alter table unit_costs           enable row level security;
alter table price_adjustments    enable row level security;
alter table wheeling_rates       enable row level security;
alter table required_unit_prices enable row level security;


-- ---------------------------------------------------------------------
-- api_price()：電價走勢頁需要的全部資料（資料量很小，一次回傳）
--   {"avg_unit_prices": [...], "unit_costs": [...], "adjustments": [...], "required": [...]}
-- ---------------------------------------------------------------------
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
        'required_price', required_price, 'base_price', base_price, 'source_url', source_url) order by meeting_date)
        from required_unit_prices), '[]'::jsonb)
  );
$$;


-- ---------------------------------------------------------------------
-- api_wheeling()：轉供費率頁需要的資料
--   {"rates": [...]}
-- ---------------------------------------------------------------------
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
        'distribution', distribution, 'total', total, 'is_derived', is_derived,
        'source_zh', source_zh, 'source_en', source_en, 'source_url', source_url) order by fuel_type, year)
        from wheeling_rates), '[]'::jsonb)
  );
$$;

revoke execute on function api_price()    from public;
revoke execute on function api_wheeling() from public;
grant  execute on function api_price()    to anon, authenticated, service_role;
grant  execute on function api_wheeling() to anon, authenticated, service_role;


-- 檢查：應該是 120、10、23、15、2
select (select count(*) from avg_unit_prices)      as 平均單價,
       (select count(*) from unit_costs)           as 售電成本,
       (select count(*) from price_adjustments)    as 調價紀錄,
       (select count(*) from wheeling_rates)       as 轉供費率,
       (select count(*) from required_unit_prices) as 應有單價;
