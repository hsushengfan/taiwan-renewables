-- =====================================================================
-- 012：轉供費率改用台電「輸配電業各項費率方案」公告 PDF，補齊各燃料別
--
-- 資料來源：台電每年 12 月底公告的「X 年輸配電業各項費率方案」，表 2「輸配電業各項費率一覽表」。
--   台電官網 → 電價費率揭露專區 → 輸配電業各項費率表
--   https://www.taipower.com.tw/2289/2558/49405/49414/nodeList
-- 原始 PDF 存在網站裡（site/files/wheeling/2022.pdf …），台電日後刪檔也看得到。
--
-- 這次做的事：
--   1. 能源類別從 2 種擴充成 8 種：平均費率、再生能源（不排碳）、再生能源（排碳，垃圾及廢輪胎等）、
--      核能、燃煤、燃油、燃氣、抽蓄水力。之後網站可以讓訪客自己勾選比較。
--   2. 補上 2022～2026 年（111～115 年）各燃料別的費率。
--   3. 修正 2023 年再生能源（不排碳）：原本的數字和台電公告對不上，改用公告值。
--   4. 補上 2025 年再生能源（不排碳）的四個分項（原本只有合計）。
--   5. 刪掉 2018 年（107 年）：轉供費率從 2019 年（108 年）開始記錄。
--
-- 含稅換算：PDF 上的費率「均內含 5% 營業稅」。資料庫一律存未稅值，
--   所以 未稅 ＝ 含稅 ÷ 1.05（四捨五入到小數第 4 位），合計 ＝ 四項含稅加總 ÷ 1.05。
--   這些列的 is_derived 設為 true（換算值）。
--   能源署原本公布的未稅數字（平均費率 2019～2026、再生能源 2019、2020、2022、2026）和換算結果一樣，
--   保留原本那幾列不動。每一列後面的註解是 PDF 上的含稅原值，方便核對。
--
-- 使用方式：整份複製，貼到 SQL Editor（下拉選單選 Database），按 Run。重複執行沒關係。
-- =====================================================================

-- 1. 能源類別擴充成 8 種
alter table wheeling_rates drop constraint if exists wheeling_rates_fuel_type_check;
alter table wheeling_rates add constraint wheeling_rates_fuel_type_check check (fuel_type in
  ('average', 're_zero_carbon', 're_carbon', 'nuclear', 'coal', 'oil', 'gas', 'pumped_hydro'));
  -- average 平均費率｜re_zero_carbon 再生能源（不排碳）｜re_carbon 再生能源（排碳）
  -- nuclear 核能｜coal 燃煤｜oil 燃油｜gas 燃氣｜pumped_hydro 抽蓄水力

-- 2～4. 從台電公告 PDF 換算的未稅值（輔助服務、電力調度、轉供輸電、轉供配電、合計）
insert into wheeling_rates (year, fuel_type, ancillary, dispatch, transmission, distribution, total, is_derived, source_zh, source_en, source_url)
select v.year, v.fuel_type, v.ancillary, v.dispatch, v.transmission, v.distribution, v.total, true,
       '台電輸配電業各項費率方案公告', 'Taipower announcement of transmission and distribution rates',
       'https://www.taipower.com.tw/2289/2558/49405/49414/nodeList'
  from (values
    (2022, 're_carbon', 0.0770, 0.1399, 0.2803, 0.5261, 1.0233),   -- 再生能源（排碳）　含稅 0.0809/0.1469/0.2943/0.5524
    (2022, 'nuclear', 0.0237, 0.0444, 0.0889, 0.1668, 0.3237),   -- 核能　含稅 0.0249/0.0466/0.0933/0.1751
    (2022, 'coal', 0.0629, 0.1147, 0.2298, 0.4314, 0.8388),   -- 燃煤　含稅 0.0660/0.1204/0.2413/0.4530
    (2022, 'oil', 0.0610, 0.1113, 0.2231, 0.4186, 0.8141),   -- 燃油　含稅 0.0641/0.1169/0.2343/0.4395
    (2022, 'gas', 0.0424, 0.0780, 0.1563, 0.2933, 0.5700),   -- 燃氣　含稅 0.0445/0.0819/0.1641/0.3080
    (2022, 'pumped_hydro', 0.0237, 0.0444, 0.0889, 0.1668, 0.3237),   -- 抽蓄水力　含稅 0.0249/0.0466/0.0933/0.1751
    (2023, 're_zero_carbon', 0.0197, 0.0076, 0.0174, 0.0324, 0.0771),   -- 再生能源（不排碳）　含稅 0.0207/0.0080/0.0183/0.0340
    (2023, 're_carbon', 0.0717, 0.1398, 0.3209, 0.5967, 1.1290),   -- 再生能源（排碳）　含稅 0.0753/0.1468/0.3369/0.6265
    (2023, 'nuclear', 0.0197, 0.0397, 0.0912, 0.1696, 0.3203),   -- 核能　含稅 0.0207/0.0417/0.0958/0.1781
    (2023, 'coal', 0.0523, 0.1024, 0.2350, 0.4370, 0.8268),   -- 燃煤　含稅 0.0549/0.1075/0.2468/0.4589
    (2023, 'oil', 0.0500, 0.0980, 0.2251, 0.4185, 0.7916),   -- 燃油　含稅 0.0525/0.1029/0.2364/0.4394
    (2023, 'gas', 0.0350, 0.0692, 0.1589, 0.2955, 0.5587),   -- 燃氣　含稅 0.0368/0.0727/0.1668/0.3103
    (2023, 'pumped_hydro', 0.0197, 0.0397, 0.0912, 0.1696, 0.3203),   -- 抽蓄水力　含稅 0.0207/0.0417/0.0958/0.1781
    (2024, 're_zero_carbon', 0.0150, 0.0387, 0.0332, 0.0664, 0.1533),   -- 再生能源（不排碳）　含稅 0.0158/0.0406/0.0349/0.0697
    (2024, 're_carbon', 0.0309, 0.2043, 0.1753, 0.3507, 0.7611),   -- 再生能源（排碳）　含稅 0.0324/0.2145/0.1841/0.3682
    (2024, 'nuclear', 0.0150, 0.1017, 0.0873, 0.1746, 0.3787),   -- 核能　含稅 0.0158/0.1068/0.0917/0.1833
    (2024, 'coal', 0.0408, 0.2678, 0.2298, 0.4598, 0.9982),   -- 燃煤　含稅 0.0428/0.2812/0.2413/0.4828
    (2024, 'oil', 0.0389, 0.2557, 0.2194, 0.4389, 0.9529),   -- 燃油　含稅 0.0408/0.2685/0.2304/0.4608
    (2024, 'gas', 0.0271, 0.1794, 0.1539, 0.3079, 0.6684),   -- 燃氣　含稅 0.0285/0.1884/0.1616/0.3233
    (2024, 'pumped_hydro', 0.0150, 0.1017, 0.0873, 0.1746, 0.3787),   -- 抽蓄水力　含稅 0.0158/0.1068/0.0917/0.1833
    (2025, 're_zero_carbon', 0.0294, 0.0518, 0.0601, 0.1245, 0.2658),   -- 再生能源（不排碳）　含稅 0.0309/0.0544/0.0631/0.1307
    (2025, 're_carbon', 0.0600, 0.1797, 0.2085, 0.4321, 0.8803),   -- 再生能源（排碳）　含稅 0.0630/0.1887/0.2189/0.4537
    (2025, 'nuclear', 0.0294, 0.0899, 0.1043, 0.2162, 0.4398),   -- 核能　含稅 0.0309/0.0944/0.1095/0.2270
    (2025, 'coal', 0.0806, 0.2402, 0.2787, 0.5775, 1.1770),   -- 燃煤　含稅 0.0846/0.2522/0.2926/0.6064
    (2025, 'oil', 0.0770, 0.2294, 0.2662, 0.5517, 1.1244),   -- 燃油　含稅 0.0809/0.2409/0.2795/0.5793
    (2025, 'gas', 0.0521, 0.1565, 0.1816, 0.3764, 0.7666),   -- 燃氣　含稅 0.0547/0.1643/0.1907/0.3952
    (2025, 'pumped_hydro', 0.0294, 0.0899, 0.1043, 0.2162, 0.4398),   -- 抽蓄水力　含稅 0.0309/0.0944/0.1095/0.2270
    (2026, 're_carbon', 0.0726, 0.0692, 0.1966, 0.4517, 0.7901),   -- 再生能源（排碳）　含稅 0.0762/0.0727/0.2064/0.4743
    (2026, 'nuclear', 0.0347, 0.0335, 0.0952, 0.2187, 0.3821),   -- 核能　含稅 0.0364/0.0352/0.1000/0.2296
    (2026, 'coal', 0.0966, 0.0918, 0.2608, 0.5993, 1.0485),   -- 燃煤　含稅 0.1014/0.0964/0.2738/0.6293
    (2026, 'oil', 0.0920, 0.0875, 0.2485, 0.5711, 0.9991),   -- 燃油　含稅 0.0966/0.0919/0.2609/0.5997
    (2026, 'gas', 0.0625, 0.0597, 0.1695, 0.3895, 0.6812),   -- 燃氣　含稅 0.0656/0.0627/0.1780/0.4090
    (2026, 'pumped_hydro', 0.0347, 0.0335, 0.0952, 0.2187, 0.3821)    -- 抽蓄水力　含稅 0.0364/0.0352/0.1000/0.2296
  ) as v(year, fuel_type, ancillary, dispatch, transmission, distribution, total)
on conflict (year, fuel_type) do update
  set ancillary = excluded.ancillary, dispatch = excluded.dispatch, transmission = excluded.transmission,
      distribution = excluded.distribution, total = excluded.total, is_derived = excluded.is_derived,
      source_zh = excluded.source_zh, source_en = excluded.source_en, source_url = excluded.source_url;

-- 5. 轉供費率從 2019 年（108 年）開始
delete from wheeling_rates where year < 2019;


-- ---------------------------------------------------------------------
-- wheeling_rate_docs：每年的台電公告原檔
--   pdf_path 是網站裡的相對路徑（GitHub Pages 會一起發布），台電刪檔也還看得到。
-- ---------------------------------------------------------------------
create table if not exists wheeling_rate_docs (
  year         int primary key,       -- 適用年度（西元）
  announced_on date not null,         -- 台電公告日期
  doc_no       text not null,         -- 發文字號
  pdf_path     text not null          -- 網站裡的 PDF 路徑
);
alter table wheeling_rate_docs enable row level security;

insert into wheeling_rate_docs (year, announced_on, doc_no, pdf_path) values
  (2022, '2022-01-18', '電規字第1110004233號', 'files/wheeling/2022.pdf'),
  (2023, '2022-12-30', '電規字第1114411686號', 'files/wheeling/2023.pdf'),
  (2024, '2023-12-28', '電規字第1120026994號', 'files/wheeling/2024.pdf'),
  (2025, '2024-12-26', '電業字第1138170550號', 'files/wheeling/2025.pdf'),
  (2026, '2025-12-26', '電業字第1148172997號', 'files/wheeling/2026.pdf')
on conflict (year) do update
  set announced_on = excluded.announced_on, doc_no = excluded.doc_no, pdf_path = excluded.pdf_path;


-- api_wheeling()：多回傳 docs（每年的公告原檔）
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
        from wheeling_rates), '[]'::jsonb),
    'docs', coalesce((select jsonb_agg(jsonb_build_object(
        'year', year, 'announced_on', announced_on, 'doc_no', doc_no, 'pdf_path', pdf_path) order by year)
        from wheeling_rate_docs), '[]'::jsonb)
  );
$$;

revoke execute on function api_wheeling() from public;
grant  execute on function api_wheeling() to anon, authenticated, service_role;


-- 檢查：應該是 2019～2026 年、平均 8 筆、再生能源（不排碳）7 筆（2021 年還沒有）、其他 6 種各 5 筆；公告原檔 5 筆
select fuel_type, count(*) as 筆數, min(year) as 起, max(year) as 迄
  from wheeling_rates group by fuel_type order by fuel_type;
select count(*) as 公告原檔 from wheeling_rate_docs;
