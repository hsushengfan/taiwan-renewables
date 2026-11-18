-- =====================================================================
-- 013：補上 2019～2021 年（108～110 年）的轉供費率，存下台電公告原檔
--
-- 資料來源：台電「108／109／110 年輸配電業各項費率方案」表 2（或表二）。
-- 原始 PDF 存在網站裡：site/files/wheeling/2019.pdf、2020.pdf、2021.pdf。
--
-- 這次做的事：
--   1. 補上 2019～2021 年除了「平均費率」以外的 7 種能源類別，
--      其中包含原本缺的 2021 年再生能源（不排碳）。
--   2. 平均費率 2019～2021、再生能源（不排碳）2019、2020：能源署原本公布的未稅數字
--      和「台電公告 ÷ 1.05」一樣，保留不動（2021 年平均費率的合計，換算是 0.6487，
--      能源署公布的是 0.6488，差在四捨五入，沿用能源署的數字）。
--   3. 108 年的檔案只有費率表那一頁，沒有公告首頁，所以公告日期和發文字號留空，
--      wheeling_rate_docs 的這兩欄改成可以是空值。
--
-- 含稅換算和 012 一樣：未稅 ＝ 含稅 ÷ 1.05（四捨五入到小數第 4 位），合計 ＝ 四項含稅加總 ÷ 1.05。
-- 每一列後面的註解是 PDF 上的含稅原值。
--
-- 使用方式：整份複製（不是只複製檔名），貼到 SQL Editor（下拉選單選 Database），按 Run。重複執行沒關係。
-- =====================================================================

insert into wheeling_rates (year, fuel_type, ancillary, dispatch, transmission, distribution, total, is_derived, source_zh, source_en, source_url)
select v.year, v.fuel_type, v.ancillary, v.dispatch, v.transmission, v.distribution, v.total, true,
       '台電輸配電業各項費率方案公告', 'Taipower announcement of transmission and distribution rates',
       'https://www.taipower.com.tw/2289/2558/49405/49414/nodeList'
  from (values
    (2019, 're_carbon', 0.0709, 0.1238, 0.3156, 0.4922, 1.0025),   -- 再生能源（排碳）　含稅 0.0744/0.1300/0.3314/0.5168
    (2019, 'nuclear', 0.0236, 0.0422, 0.1077, 0.1679, 0.3414),   -- 核能　含稅 0.0248/0.0443/0.1131/0.1763
    (2019, 'coal', 0.0597, 0.1046, 0.2666, 0.4158, 0.8467),   -- 燃煤　含稅 0.0627/0.1098/0.2799/0.4366
    (2019, 'oil', 0.0553, 0.0970, 0.2471, 0.3854, 0.7850),   -- 燃油　含稅 0.0581/0.1019/0.2595/0.4047
    (2019, 'gas', 0.0412, 0.0727, 0.1852, 0.2888, 0.5879),   -- 燃氣　含稅 0.0433/0.0763/0.1945/0.3032
    (2019, 'pumped_hydro', 0.0236, 0.0422, 0.1077, 0.1679, 0.3414),   -- 抽蓄水力　含稅 0.0248/0.0443/0.1131/0.1763
    (2020, 're_carbon', 0.0719, 0.1329, 0.2953, 0.4622, 0.9623),   -- 再生能源（排碳）　含稅 0.0755/0.1395/0.3101/0.4853
    (2020, 'nuclear', 0.0250, 0.0472, 0.1048, 0.1640, 0.3410),   -- 核能　含稅 0.0263/0.0496/0.1100/0.1722
    (2020, 'coal', 0.0644, 0.1192, 0.2649, 0.4146, 0.8630),   -- 燃煤　含稅 0.0676/0.1252/0.2781/0.4353
    (2020, 'oil', 0.0609, 0.1128, 0.2507, 0.3924, 0.8167),   -- 燃油　含稅 0.0639/0.1184/0.2632/0.4120
    (2020, 'gas', 0.0439, 0.0816, 0.1814, 0.2840, 0.5910),   -- 燃氣　含稅 0.0461/0.0857/0.1905/0.2982
    (2020, 'pumped_hydro', 0.0250, 0.0472, 0.1048, 0.1640, 0.3410),   -- 抽蓄水力　含稅 0.0263/0.0496/0.1100/0.1722
    (2021, 're_zero_carbon', 0.0292, 0.0052, 0.0092, 0.0150, 0.0588),   -- 再生能源（不排碳）　含稅 0.0307/0.0055/0.0097/0.0158
    (2021, 're_carbon', 0.0984, 0.1794, 0.3155, 0.5134, 1.1068),   -- 再生能源（排碳）　含稅 0.1033/0.1884/0.3313/0.5391
    (2021, 'nuclear', 0.0292, 0.0549, 0.0967, 0.1573, 0.3381),   -- 核能　含稅 0.0307/0.0576/0.1015/0.1652
    (2021, 'coal', 0.0774, 0.1413, 0.2491, 0.4053, 0.8732),   -- 燃煤　含稅 0.0813/0.1484/0.2616/0.4256
    (2021, 'oil', 0.0742, 0.1356, 0.2391, 0.3890, 0.8380),   -- 燃油　含稅 0.0779/0.1424/0.2511/0.4085
    (2021, 'gas', 0.0520, 0.0958, 0.1688, 0.2746, 0.5911),   -- 燃氣　含稅 0.0546/0.1006/0.1772/0.2883
    (2021, 'pumped_hydro', 0.0292, 0.0549, 0.0967, 0.1573, 0.3381)    -- 抽蓄水力　含稅 0.0307/0.0576/0.1015/0.1652
  ) as v(year, fuel_type, ancillary, dispatch, transmission, distribution, total)
on conflict (year, fuel_type) do update
  set ancillary = excluded.ancillary, dispatch = excluded.dispatch, transmission = excluded.transmission,
      distribution = excluded.distribution, total = excluded.total, is_derived = excluded.is_derived,
      source_zh = excluded.source_zh, source_en = excluded.source_en, source_url = excluded.source_url;


-- 公告原檔：108 年的檔案沒有公告首頁，日期和字號留空
alter table wheeling_rate_docs alter column announced_on drop not null;
alter table wheeling_rate_docs alter column doc_no drop not null;

insert into wheeling_rate_docs (year, announced_on, doc_no, pdf_path) values
  (2019, null,         null,                    'files/wheeling/2019.pdf'),
  (2020, '2019-12-05', '電輸供部規字第1080020907號', 'files/wheeling/2020.pdf'),
  (2021, '2020-12-18', '電規字第1090026794號',      'files/wheeling/2021.pdf')
on conflict (year) do update
  set announced_on = excluded.announced_on, doc_no = excluded.doc_no, pdf_path = excluded.pdf_path;


-- 檢查：8 種能源類別都應該是 8 筆（2019～2026）；公告原檔 8 筆
select fuel_type, count(*) as 筆數, min(year) as 起, max(year) as 迄
  from wheeling_rates group by fuel_type order by fuel_type;
select count(*) as 公告原檔 from wheeling_rate_docs;
