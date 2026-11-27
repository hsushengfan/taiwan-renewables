-- =====================================================================
-- 020：業者財務分析（第 3 階段）——匯入年報讀出的數字，並算出每度電的單價
--
-- 為什麼：業者小檔案頁要顯示「財務分析」：售電單價、購電成本、價差、營業利益率（售電業），
--   以及發電量、每度售電收入（發電業）。每個數字都要能回到哪一年的年報、第幾頁。
-- 做了什麼：
--   1. company_financials 加上發電業的欄位、頁碼、狀態、特殊情況（flags）
--   2. 把 data/company_financials.csv 的 94 列匯入（一份年報一列；會先刪掉舊的年報資料再寫入）
--   3. 新增 view company_unit_metrics：每一列算好每度電的單價（推估）
--   4. api_company 的 financials 改成讀這個 view，並附上那一年年報的連結
-- 算法和限制見 docs/methodology.md「業者財務分析」。數字都是推估值。
--
-- 使用方式：整份複製（不是只複製檔名），在 SQL Editor 開新分頁貼上（下拉選單選 Database），按 Run。重複執行沒關係。
-- =====================================================================

-- 1. 新欄位（發電業的電量、頁碼、狀態）
alter table company_financials
  add column if not exists capacity_kw           numeric,   -- 發電業：裝置容量（瓩）
  add column if not exists gross_generation_kwh  numeric,   -- 發電業：毛發電量（度）
  add column if not exists net_generation_kwh    numeric,   -- 發電業：淨發電量（度）
  add column if not exists sold_to_taipower_kwh  numeric,   -- 發電業：售予台電（公用售電業）（度）
  add column if not exists sold_to_retailers_kwh numeric,   -- 發電業：售予再生能源售電業（度）
  add column if not exists sold_to_users_kwh     numeric,   -- 發電業：直／轉供予用戶（度）
  add column if not exists capacity_factor_pct   numeric,   -- 發電業：容量因數（%）
  add column if not exists pages   text,                    -- 每個數字在第幾頁，例如「購電量 p5；售電量 p6；收支表 p10」
  add column if not exists source  text,                    -- pdf／html（年報是網頁）／missing（讀不到）
  add column if not exists scanned text,                    -- 有掃描頁或圖片表格
  add column if not exists masked  boolean not null default false,  -- 收支表有遮蔽
  add column if not exists status  text,                    -- complete／partial／masked／no_fin／missing
  add column if not exists flags   text[] not null default '{}';    -- fee／cost_other／mismatch（見下面 view 的說明）

-- 2. 資料
drop table if exists tmp_fin;
create temporary table tmp_fin (
  company_id int, year int, period text, page int,
  purchased_kwh numeric, sold_kwh numeric, capacity_kw numeric, gross_generation_kwh numeric, net_generation_kwh numeric,
  sold_to_taipower_kwh numeric, sold_to_retailers_kwh numeric, sold_to_users_kwh numeric, capacity_factor_pct numeric,
  operating_revenue numeric, electricity_revenue numeric, operating_cost numeric, operating_expense numeric,
  pages text, source text, scanned text, masked boolean, status text, flags text[], note text
);
insert into tmp_fin values
  (16, 2024, 'annual', 6, 10220246, 10220246, null, null, null, null, null, null, null, 883305, 883305, 224114, 333067, '收支表 p6；購電量 p4；售電量 p4', 'pdf', null, false, 'complete', array['fee']::text[], '電業收入每度只有約 0.09 元，可能只認列服務費（不是全額售電收入），「電業收入 ÷ 售電量」不適合當售電單價'),
  (16, 2025, 'annual', 9, 25266716, 25266716, null, null, null, null, null, null, null, 4874194, 4874194, 574093, 261194, '收支表 p9；購電量 p3,4,5；售電量 p8', 'pdf', null, false, 'complete', array['fee']::text[], '購電量＝第一型 19,012,874＋第二型 0＋第三型 6,253,842；電業收入每度只有約 0.19 元，可能只認列服務費（不是全額售電收入），「電業收入 ÷ 售電量」不適合當售電單價'),
  (18, 2021, 'annual', 10, null, null, null, null, null, null, null, null, null, null, null, null, 1826, '收支表 p10', 'pdf', null, false, 'partial', '{}'::text[], '購電、售電表沒有數字；收支表只有營業費用 1,826 元'),
  (18, 2022, 'annual', 10, null, 7168231, null, null, null, null, null, null, null, null, 38708451, 38626797, 217634, '收支表 p10；售電量 p4', 'pdf', null, false, 'partial', '{}'::text[], '購電表沒有合計'),
  (18, 2023, 'annual', 10, null, 39735938, null, null, null, null, null, null, null, null, 218055922, 217382258, 958851, '收支表 p10；售電量 p4', 'pdf', null, false, 'partial', '{}'::text[], '購電表沒有合計'),
  (18, 2024, 'annual', 6, 29300834, 29300834, null, null, null, null, null, null, null, null, 160296291, 158570989, 754858, '收支表 p6；購電量 p3；售電量 p4', 'pdf', null, false, 'complete', '{}'::text[], null),
  (2, 2020, 'annual', 9, 37440966, 37440966, null, null, null, null, null, null, null, 4852600, 4566886, 0, 801506, '收支表 p9；購電量 p5；售電量 p6', 'pdf', null, false, 'complete', array['fee']::text[], '收支表寫「-」的欄位記為 0；電業收入每度只有約 0.12 元，可能只認列服務費（不是全額售電收入），「電業收入 ÷ 售電量」不適合當售電單價'),
  (2, 2021, 'annual', 9, 109349926, 109349926, null, null, null, null, null, null, null, 13110524, 13110524, 0, 3943907, '收支表 p9；購電量 p5；售電量 p6', 'pdf', null, false, 'complete', array['fee']::text[], '收支表寫「-」的欄位記為 0；電業收入每度只有約 0.12 元，可能只認列服務費（不是全額售電收入），「電業收入 ÷ 售電量」不適合當售電單價'),
  (2, 2022, 'annual', 10, 173763385, 173763385, null, null, null, null, null, null, null, 28212195, 27558909, 35200, 5960915, '收支表 p10；購電量 p5；售電量 p7', 'pdf', null, false, 'complete', array['fee']::text[], '電業收入每度只有約 0.16 元，可能只認列服務費（不是全額售電收入），「電業收入 ÷ 售電量」不適合當售電單價'),
  (2, 2023, 'annual', 10, 137492749, 137492749, null, null, null, null, null, null, null, 20785994, 20785994, 0, 6116396, '收支表 p10；購電量 p5；售電量 p7', 'pdf', null, false, 'complete', array['fee']::text[], '收支表寫「-」的欄位記為 0；電業收入每度只有約 0.15 元，可能只認列服務費（不是全額售電收入），「電業收入 ÷ 售電量」不適合當售電單價'),
  (2, 2024, 'annual', 13, 168922476, 168922476, null, null, null, null, null, null, null, 31546854, 31546854, 0, 6196146, '收支表 p13；購電量 p6；售電量 p9', 'pdf', null, false, 'complete', array['fee']::text[], '收支表寫「-」的欄位記為 0；電業收入每度只有約 0.19 元，可能只認列服務費（不是全額售電收入），「電業收入 ÷ 售電量」不適合當售電單價'),
  (2, 2025, 'annual', 16, 227204512, 227204512, null, null, null, null, null, null, null, 48373700, 48373700, 0, 8475634, '收支表 p16；購電量 p7；售電量 p12', 'pdf', null, false, 'complete', array['fee']::text[], '收支表寫「-」的欄位記為 0；電業收入每度只有約 0.21 元，可能只認列服務費（不是全額售電收入），「電業收入 ÷ 售電量」不適合當售電單價'),
  (19, 2023, 'annual', 2, null, null, null, null, null, null, null, null, null, 1893006000, null, 1467809000, 221801000, '收支表 p2', 'pdf', null, false, 'partial', '{}'::text[], '官網放的是「112年大同智能合併三表」（合併財務報表草稿，含子公司），不是簡明年報；沒有電量；官網放的是合併財務報表草稿；單位千元已換成元'),
  (19, 2024, 'annual', 16, 16603504, 16603504, null, null, null, null, null, null, null, 9522638, 9522638, 0, 60659, '收支表 p16；購電量 p11；售電量 p12', 'pdf', '部分掃描（第 18 頁起）', false, 'complete', array['fee']::text[], '第 18 頁以後是掃描的財務報告（不需要）；電業收入每度只有約 0.57 元，可能只認列服務費（不是全額售電收入），「電業收入 ÷ 售電量」不適合當售電單價'),
  (19, 2025, 'annual', 17, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'pdf', '部分掃描（第 19 頁起）', true, 'masked', '{}'::text[], '第 19 頁以後是掃描的財務報告（不需要）；購電量、售電量和收支表在畫面上用黑色螢光筆註解遮住，只露出最後三位數（PDF 文字層還有完整數字，但業者有意遮蔽，照規格存空值）'),
  (12, 2022, 'annual', 9, null, null, null, null, null, null, null, null, null, 3614791, 0, 0, 6617081, '收支表 p9', 'pdf', null, false, 'partial', '{}'::text[], '收支表寫「-」的欄位記為 0；購電、售電表沒有數字（報告說 2023 年第 3 季才開始供電）'),
  (12, 2023, 'annual', 9, 2473997, 2473997, null, null, null, null, null, null, null, 19304064, 19304064, 18111532, 10393351, '收支表 p9；購電量 p6；售電量 p6', 'pdf', null, false, 'complete', '{}'::text[], null),
  (12, 2024, 'annual', 12, 22590614, 22590614, null, null, null, null, null, null, null, 122485992, 121504694, 116143209, 13680589, '收支表 p12；購電量 p7；售電量 p8', 'pdf', null, false, 'complete', '{}'::text[], null),
  (12, 2025, 'annual', 15, null, 90491790, null, null, null, null, null, null, null, 492979903, 491109194, 470034014, 18034749, '收支表 p15；售電量 p13', 'pdf', null, true, 'partial', '{}'::text[], '購電表在畫面上整張塗黑（連合計都遮住），購電量存空值；售電量和收支表沒有遮'),
  (1, 2024, 'annual', 19, 187062353, 187062353, null, null, null, null, null, null, null, null, null, null, null, '收支表 p19；購電量 p12；售電量 p16', 'pdf', null, true, 'masked', '{}'::text[], '收支表數字有遮蔽（*、x），存空值：營業收入、電業收入、營業成本、營業費用'),
  (1, 2025, 'annual', 18, 415889334, 415889334, null, null, null, null, null, null, null, null, null, null, null, '收支表 p18；購電量 p13；售電量 p15', 'pdf', null, true, 'masked', '{}'::text[], '收支表數字有遮蔽（*、x），存空值：營業收入、電業收入、營業成本、營業費用'),
  (3, 2020, 'annual', 7, 144205, 144205, null, null, null, null, null, null, null, null, null, null, null, '購電量 p7；售電量 p7', 'pdf', null, false, 'partial', '{}'::text[], '沒有收支實績表；這份是「營運綜合摘要分析報告」，沒有收支實績表'),
  (3, 2021, 'annual', 13, 8499185, 8499185, null, null, null, null, null, null, null, 157250350, 30883900, 133156456, 21595958, '收支表 p13；購電量 p7；售電量 p7', 'pdf', null, false, 'complete', array['cost_other']::text[], '營業成本 ÷ 購電量約 15.7 元／度，營業成本不只購電，購電成本推估不適用'),
  (3, 2022, 'annual', 14, 67248129, 67535359, null, null, null, null, null, null, null, 362249559, 245578225, 289983486, 38195128, '收支表 p14；購電量 p7；售電量 p8', 'pdf', null, false, 'complete', '{}'::text[], '售電量合計比購電量多 287,230 度，照報告記錄'),
  (3, 2023, 'annual', 11, 127383414, null, null, null, null, null, null, null, null, 834249590, 607364554, 723195406, 57747619, '收支表 p11；購電量 p7', 'pdf', null, false, 'partial', '{}'::text[], '售電表沒有合計'),
  (3, 2024, 'annual', 12, 202708738, 202708738, null, null, null, null, null, null, null, null, null, null, null, '收支表 p12；購電量 p8；售電量 p11', 'pdf', null, true, 'masked', '{}'::text[], '收支表數字有遮蔽（*、x），存空值：營業收入、電業收入、營業成本、營業費用'),
  (3, 2025, 'annual', 12, null, 245276447, null, null, null, null, null, null, null, null, null, null, null, '收支表 p12；售電量 p11', 'pdf', null, true, 'masked', '{}'::text[], '收支表數字有遮蔽（*、x），存空值：營業收入、電業收入、營業成本、營業費用；購電表沒有合計（只寫「購自第三型自用發電設備 45,251,095 度」）；售電表合計在第 11 頁，表頭誤寫成 113 年'),
  (17, 2022, 'annual', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'html', null, false, 'no_fin', '{}'::text[], '沒有收支實績表；年報是公告網頁，只有重大營運事件（康展 2023 年 5 月才開始轉供）'),
  (17, 2023, 'annual', null, null, 939236, null, null, null, null, null, null, null, null, null, null, null, '售電量（網頁）', 'html', null, false, 'partial', '{}'::text[], '沒有收支實績表；年報是公告網頁；只有售電表，沒有購電量和收支表'),
  (17, 2024, 'annual', null, null, 9878129, null, null, null, null, null, null, null, null, null, null, null, '售電量（網頁）', 'html', null, false, 'partial', '{}'::text[], '沒有收支實績表；年報是公告網頁；只有售電表，沒有購電量和收支表'),
  (17, 2025, 'annual', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'html', null, false, 'no_fin', '{}'::text[], '沒有收支實績表；年報是公告網頁，售電表只有逐筆、沒有合計，也沒有購電量和收支表'),
  (7, 2024, 'annual', 7, 34874, 34874, null, null, null, null, null, null, null, null, 230333, 196399, 10105528, '收支表 p7；購電量 p4；售電量 p5', 'pdf', null, false, 'complete', '{}'::text[], null),
  (7, 2025, 'annual', 12, 201233762, 201233762, null, null, null, null, null, null, null, null, null, null, null, '收支表 p12；購電量 p3,9；售電量 p10', 'pdf', null, true, 'masked', '{}'::text[], '收支表數字有遮蔽（*、x），存空值：營業收入、電業收入、營業成本、營業費用；購電量＝第一型 91,872,789＋第三型 109,360,973'),
  (4, 2022, 'annual', 10, 6482149, 6482149, null, null, null, null, null, null, null, 1359196, 1359196, 0, 258544, '收支表 p10；購電量 p5；售電量 p6', 'pdf', null, false, 'complete', array['fee']::text[], '電業收入每度只有約 0.21 元，可能只認列服務費（不是全額售電收入），「電業收入 ÷ 售電量」不適合當售電單價'),
  (9, 2023, 'annual', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'missing', null, false, 'missing', '{}'::text[], '讀不到：晨星官網的 SSL 憑證不完整，本環境無法下載；請使用者下載後上傳'),
  (9, 2025, 'annual', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'missing', null, false, 'missing', '{}'::text[], '讀不到：晨星官網的 SSL 憑證不完整，本環境無法下載；請使用者下載後上傳'),
  (20, 2020, 'annual', 4, null, 25129, null, null, null, null, null, null, null, 128114, 128114, 96001, 2003524, '收支表 p4；售電量 p2', 'pdf', null, false, 'partial', '{}'::text[], '購電表沒有合計'),
  (20, 2021, 'annual', 4, 627412, 627412, null, null, null, null, null, null, null, 3076410, 3076410, 2797381, 1831691, '收支表 p4；購電量 p1；售電量 p3', 'pdf', null, false, 'complete', '{}'::text[], null),
  (20, 2022, 'annual', 6, 2363611, 2363611, null, null, null, null, null, null, null, 11636558, 11636558, 10374884, 308447, '收支表 p6；購電量 p1；售電量 p3', 'pdf', null, false, 'complete', '{}'::text[], null),
  (20, 2023, 'annual', 6, 5094095, 5094095, null, null, null, null, null, null, null, 26083906, 26083906, 22757128, 1154045, '收支表 p6；購電量 p1；售電量 p3', 'pdf', null, false, 'complete', '{}'::text[], null),
  (20, 2024, 'annual', 6, 13658012, 13658012, null, null, null, null, null, null, null, 71007926, 71007926, 62816155, 3691747, '收支表 p6；購電量 p1；售電量 p3', 'pdf', null, false, 'complete', '{}'::text[], null),
  (20, 2025, 'annual', 5, 25825209, 25825209, null, null, null, null, null, null, null, 134287145, 134287145, 119182320, 8660699, '收支表 p5；購電量 p1；售電量 p3', 'pdf', null, false, 'complete', '{}'::text[], null),
  (5, 2022, 'annual', 7, 0, null, null, null, null, null, null, null, null, 0, 0, 0, 239551, '收支表 p7；購電量 p3', 'pdf', null, false, 'partial', '{}'::text[], '當年還沒開始售電：購電量 0，售電表沒有數字'),
  (5, 2023, 'annual', 7, 6706282, 6706282, null, null, null, null, null, null, null, 0, 34781444, 32718978, 5493110, '收支表 p7；購電量 p3；售電量 p4', 'pdf', null, false, 'complete', '{}'::text[], '收支表寫「-」的欄位記為 0'),
  (5, 2024, 'annual', 7, 40177782, 40177782, null, null, null, null, null, null, null, 218916800, 218869867, 212881528, 12051159, '收支表 p7；購電量 p3；售電量 p4', 'pdf', null, false, 'complete', '{}'::text[], null),
  (5, 2025, 'annual', 11, 132255698, 132255698, null, null, null, null, null, null, null, 725117260, 725117260, 698063789, 18791982, '收支表 p11；購電量 p2,3,7；售電量 p10', 'pdf', null, false, 'complete', '{}'::text[], '購電量＝第一型 73,218,933＋第二型 1,173,983＋第三型 57,862,782（三張表相加）'),
  (8, 2023, 'annual', 13, 158238106, null, null, null, null, null, null, null, null, null, 0, null, null, '收支表 p13；購電量 p6', 'pdf', null, true, 'masked', '{}'::text[], '收支表數字有遮蔽（*、x），存空值：營業收入、營業成本、營業費用；購電量報告寫 158,238,106.3 度；售電表沒有合計；收支表數字有遮蔽；報告把收入全部列在「其他營業收入」（有遮蔽），電業收入寫 0'),
  (8, 2024, 'annual', 17, 17287896, 17287896, null, null, null, null, null, null, null, 104853125, 104124889, 97609103, 11456249, '收支表 p17；購電量 p8；售電量 p9', 'pdf', '收支表是圖片', false, 'complete', '{}'::text[], '收支表是圖片，用 OCR 辨識並看圖確認'),
  (8, 2025, 'annual', 26, null, null, null, null, null, null, null, null, null, 683023685, 683023685, 525950434, 18206021, '收支表 p26', 'pdf', '收支表是圖片', false, 'partial', '{}'::text[], '收支表是圖片，用 OCR 辨識並看圖確認；購電表只有逐筆數字、沒有合計；售電表是空白圖片'),
  (10, 2022, 'annual', 8, null, null, null, null, null, null, null, null, null, 0, 0, 0, 2060651, '收支表 p8', 'pdf', null, false, 'partial', '{}'::text[], '購電、售電表沒有數字（當年營收為 0）'),
  (10, 2023, 'annual', 6, null, 7142158, null, null, null, null, null, null, null, 40710375, 40710375, 38710537, 7815849, '收支表 p6；售電量 p4', 'pdf', null, false, 'partial', '{}'::text[], '購電表沒有合計'),
  (10, 2024, 'annual', 6, 27205918, 27205918, null, null, null, null, null, null, null, 148379232, 148379232, 144992953, 39672393, '收支表 p6；購電量 p3；售電量 p4', 'pdf', null, false, 'complete', '{}'::text[], null),
  (10, 2025, 'annual', 13, 120897667, 120897667, null, null, null, null, null, null, null, null, null, null, null, '收支表 p13；購電量 p1,9；售電量 p12', 'pdf', null, true, 'masked', '{}'::text[], '收支表數字有遮蔽（*、x），存空值：電業收入、營業成本、營業費用；購電量＝第一型 18,585,689＋第三型 102,311,978'),
  (6, 2024, 'annual', 21, null, 27580855, null, null, null, null, null, null, null, 309900139, 309469200, 291468161, 17006038, '收支表 p21；售電量 p3', 'pdf', null, false, 'partial', array['mismatch']::text[], '購電表沒有合計；售電量取第 3 頁「本年度售電量為 27,580,855 度」；文字寫的售電量 27,580,855 度和電業收入 309,469,200 元對不起來（約 11.2 元／度），建議優先抽查'),
  (6, 2025, 'annual', 24, 134354124, 134354124, null, null, null, null, null, null, null, null, null, null, null, '收支表 p24；購電量 p5,12；售電量 p3', 'pdf', null, true, 'masked', '{}'::text[], '收支表數字有遮蔽（*、x），存空值：營業收入、電業收入、營業成本、營業費用；購電量＝第一型 52,520,022＋第三型 81,834,102；售電量取第 3 頁「本年度售電量為 134,354,124 度」，收支表數字有遮蔽'),
  (22, 2024, 'annual', 3, null, null, 75900, 137427341, null, 0, null, 133295200, 20.61, null, null, null, null, '裝置容量 p3；毛發電量 p4；售予台電 p6；直轉供 p6；容量因數 p4', 'pdf', null, false, 'no_fin', '{}'::text[], '發電量表只有毛發電量和廠用電量'),
  (22, 2025, 'annual', 3, null, null, 75900, 138116902, 133713801, 0, 0, 133713801, 20.77, null, null, null, null, '裝置容量 p3；毛發電量 p3；淨發電量 p3；售予台電 p5；售予售電業 p5；直轉供 p5；容量因數 p4', 'pdf', null, false, 'no_fin', '{}'::text[], null),
  (25, 2025, 'annual', 3, null, null, 49200, 143929151, 139421311, 0, 0, 139421311, 33.39, null, null, null, null, '裝置容量 p3；毛發電量 p3；淨發電量 p3；售予台電 p5；售予售電業 p5；直轉供 p5；容量因數 p4', 'pdf', null, false, 'no_fin', '{}'::text[], null),
  (35, 2022, 'annual', 12, null, null, 92979.81, 124584830, 124172311, 122768326, null, null, 15.24, 635317940, 635317940, 367391752, 45347200, '收支表 p12；裝置容量 p4；毛發電量 p5；淨發電量 p6；售予台電 p11；容量因數 p7', 'pdf', null, false, 'complete', '{}'::text[], null),
  (35, 2023, 'annual', 12, null, null, 92979.81, 118662432, 118254555, 117091274, null, null, 14.56, 636409570, 636409570, 375192530, 42130762, '收支表 p12；裝置容量 p4；毛發電量 p5；淨發電量 p6；售予台電 p11；容量因數 p7', 'pdf', null, false, 'complete', '{}'::text[], null),
  (35, 2024, 'annual', 11, null, null, 92979.81, 123329467, 122829203, 122126558, null, null, 15.1, 645068447, 645068447, 381735633, 44300457, '收支表 p11；裝置容量 p4；毛發電量 p5；淨發電量 p6；售予台電 p10；容量因數 p7', 'pdf', null, false, 'complete', '{}'::text[], null),
  (35, 2025, 'annual', 8, null, null, 92979.81, 122464356, 121872509, null, null, 121872509, 15.04, 707249737, 707249737, 383386868, 52356066, '收支表 p8；裝置容量 p4；毛發電量 p5；淨發電量 p5；直轉供 p7；容量因數 p5', 'pdf', null, false, 'complete', '{}'::text[], null),
  (23, 2020, 'annual', 14, null, null, 70200, 94986732, 94986732, 21507691, null, 73479041, 18.07, 271910092, 271910092, 124970437, 74167423, '收支表 p14；裝置容量 p6；毛發電量 p7；淨發電量 p8；售予台電 p13；直轉供 p13；容量因數 p9', 'pdf', null, false, 'complete', '{}'::text[], null),
  (37, 2022, 'annual', 13, null, null, 79980.0, 119878400, 119045322, 119045322, null, null, 17.11, null, 570130201, 414430002, 5632254, '收支表 p13；裝置容量 p5；毛發電量 p6；淨發電量 p7；售予台電 p12；容量因數 p8', 'pdf', null, false, 'complete', '{}'::text[], null),
  (37, 2023, 'annual', 13, null, null, 79980.0, 118726400, 117675935, 117675935, null, null, 16.95, null, 563582528, 417513175, 12102886, '收支表 p13；裝置容量 p5；毛發電量 p6；淨發電量 p7；售予台電 p12；容量因數 p8', 'pdf', null, false, 'complete', '{}'::text[], null),
  (37, 2024, 'annual', 14, null, null, 79980.0, 118848000, 117643968, 117643968, null, null, 16.92, null, 562756464, 425098209, 5081522, '收支表 p14；裝置容量 p5；毛發電量 p6；淨發電量 p7；售予台電 p13；容量因數 p8', 'pdf', null, false, 'complete', '{}'::text[], null),
  (37, 2025, 'annual', 12, null, null, 79980.0, 115953689, 114788700, 26617411, 89022489, null, null, null, 610887158, 428770607, 8814838, '收支表 p12；裝置容量 p5；毛發電量 p6；淨發電量 p6；售予台電 p10；售予售電業 p11', 'pdf', null, false, 'complete', '{}'::text[], '沒有發電設備運作情形表'),
  (31, 2022, 'annual', 13, null, null, 116510.4, 176696410, 175431698, 175431698, null, null, 17.33, null, 839002201, 618207598, 9080004, '收支表 p13；裝置容量 p5；毛發電量 p6；淨發電量 p7；售予台電 p12；容量因數 p8', 'pdf', null, false, 'complete', '{}'::text[], null),
  (31, 2023, 'annual', 13, null, null, 116510.4, 175142399, 173530757, 173530757, null, null, 17.16, null, 829782036, 611952730, 11423763, '收支表 p13；裝置容量 p5；毛發電量 p6；淨發電量 p7；售予台電 p12；容量因數 p8', 'pdf', null, false, 'complete', '{}'::text[], null),
  (31, 2024, 'annual', 14, null, null, 116510.4, 175168000, 173231554, 173231554, null, null, 17.12, null, 827601285, 633455288, 12741403, '收支表 p14；裝置容量 p5；毛發電量 p6；淨發電量 p7；售予台電 p13；容量因數 p8', 'pdf', null, false, 'complete', '{}'::text[], null),
  (31, 2025, 'annual', 12, null, null, 116510.4, 171171584, 169289984, 0, null, 171171584, null, null, 957583612, 644174688, 6251890, '收支表 p12；裝置容量 p5；毛發電量 p6；淨發電量 p6；售予台電 p10；直轉供 p11', 'pdf', null, false, 'complete', array['mismatch']::text[], '轉供量 171,171,584 度等於毛發電量、比淨發電量多，照報告記錄；沒有發電設備運作情形表'),
  (39, 2025, 'annual', 3, null, null, 11500, 26064643, 25732672, 0, 0, 25732672, 25.87, null, null, null, null, '裝置容量 p3；毛發電量 p3；淨發電量 p3；售予台電 p5；售予售電業 p5；直轉供 p5；容量因數 p4', 'pdf', null, false, 'no_fin', '{}'::text[], null),
  (40, 2025, 'annual', 3, null, null, 25200, 63612084, 61681305, 0, 0, 61681305, 28.82, null, null, null, null, '裝置容量 p3；毛發電量 p3；淨發電量 p3；售予台電 p5；售予售電業 p5；直轉供 p5；容量因數 p4', 'pdf', null, false, 'no_fin', '{}'::text[], null),
  (38, 2020, 'annual', 9, null, null, 19999.2, 20389927, 20389927, 421935, null, 19967992, null, 63992798, 63992798, 105499811, 10186499, '收支表 p9；裝置容量 p2；毛發電量 p3；淨發電量 p4；售予台電 p8；直轉供 p8', 'pdf', null, false, 'complete', '{}'::text[], null),
  (38, 2021, 'annual', 19, null, null, 19999.2, 30125705, 30125705, 1024889, null, 29100816, null, 108432797, 108432797, 77778505, 48089395, '收支表 p19；裝置容量 p2；毛發電量 p3；淨發電量 p4；售予台電 p18；直轉供 p18', 'pdf', null, false, 'complete', '{}'::text[], null),
  (38, 2022, 'annual', 22, null, null, 19999.2, 28908808, 28908808, 0, null, 28908808, null, 105691589, 105691589, 79004518, 6368620, '收支表 p22；裝置容量 p2；毛發電量 p3；淨發電量 p4；售予台電 p21；直轉供 p21', 'pdf', null, false, 'complete', '{}'::text[], null),
  (38, 2023, 'annual', 19, null, null, 19999.2, 28929413, 28929413, 0, null, 28929413, null, 105805366, 105805366, 79040887, 4396698, '收支表 p19；裝置容量 p2；毛發電量 p3；淨發電量 p4；售予台電 p17；直轉供 p17', 'pdf', null, false, 'complete', '{}'::text[], null),
  (38, 2024, 'annual', 16, null, null, 19999.2, 28459200, 28459200, 0, null, 28929413, null, 104819388, 104819388, 85551819, 3387473, '收支表 p16；裝置容量 p2；毛發電量 p3；淨發電量 p4；售予台電 p14；直轉供 p14', 'pdf', null, false, 'complete', array['mismatch']::text[], '轉供量 28,929,413 度和 2023 年一樣、比 2024 年發電量多，可能是報告沿用前一年數字，建議優先抽查'),
  (38, 2025, 'annual', 12, null, null, 19999.2, 14917273, 12070022, null, null, 14798836, 8.35, 90306332, 90306332, 107103298, 2934517, '收支表 p12；裝置容量 p1；毛發電量 p1；淨發電量 p1；直轉供 p11；容量因數 p2', 'pdf', null, false, 'complete', array['mismatch']::text[], '2025 年發電量只有前一年的一半，而且轉供量比淨發電量多，建議優先抽查'),
  (29, 2025, 'annual', 3, null, null, 33600, 88982329, 87221936, 0, 0, 87221936, 30.23, null, null, null, null, '裝置容量 p3；毛發電量 p3；淨發電量 p3；售予台電 p5；售予售電業 p5；直轉供 p5；容量因數 p4', 'pdf', null, false, 'no_fin', '{}'::text[], null),
  (32, 2023, 'annual', 6, null, null, 87833.6, 8141898, 8141898, null, null, null, 12.87, 56094917, 56094917, 25488019, 2743047, '收支表 p6；裝置容量 p3；毛發電量 p3；淨發電量 p3；容量因數 p4', 'pdf', null, false, 'complete', '{}'::text[], '售予台電欄寫「尚未開躉」'),
  (32, 2024, 'annual', 6, null, null, 87833.6, 129579384, 129579384, 121862656, null, null, 15.67, 810190253, 674372197, 452190101, 16307957, '收支表 p6；裝置容量 p3；毛發電量 p3；淨發電量 p3；售予台電 p5；容量因數 p4', 'pdf', null, false, 'complete', '{}'::text[], null),
  (32, 2025, 'annual', 5, null, null, null, 129477439, null, 0, null, 129477439, 16.83, null, 750373178, 440644799, 16895701, '收支表 p5；毛發電量 p3；售予台電 p4；直轉供 p5；容量因數 p4', 'pdf', null, false, 'complete', '{}'::text[], '沒有裝置容量表；營業收入那一列沒有數字'),
  (27, 2025, 'annual', 3, null, null, 43700, 84686303, 82534058, 0, 0, 82534058, 22.12, null, null, null, null, '裝置容量 p3；毛發電量 p3；淨發電量 p3；售予台電 p5；售予售電業 p5；直轉供 p5；容量因數 p4', 'pdf', null, false, 'no_fin', '{}'::text[], null),
  (30, 2021, 'annual', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'missing', null, false, 'missing', '{}'::text[], '讀不到：年報連結（Box）已失效，Box 顯示找不到檔案'),
  (30, 2022, 'annual', 12, null, null, 88038.72, 120505602, 120007744, 119151430, null, null, 15.66, 581397331, 581397331, 440391715, 42936019, '收支表 p12；裝置容量 p4；毛發電量 p5；淨發電量 p6；售予台電 p11；容量因數 p7', 'pdf', null, false, 'complete', '{}'::text[], null),
  (30, 2023, 'annual', 12, null, null, 88038.72, 110925984, 110395512, 109365367, null, null, 14.37, 575506366, 575506366, 444577838, 39975852, '收支表 p12；裝置容量 p4；毛發電量 p5；淨發電量 p6；售予台電 p11；容量因數 p7', 'pdf', null, false, 'complete', '{}'::text[], null),
  (30, 2024, 'annual', 12, null, null, 88038.72, 115819073, 115129829, null, null, 115363667, 14.98, 643983494, 643983494, 454094880, 32917729, '收支表 p12；裝置容量 p4；毛發電量 p5；淨發電量 p6；直轉供 p10；容量因數 p7', 'pdf', null, false, 'complete', '{}'::text[], '轉供量 115,363,667 度比淨發電量 115,129,829 度多，照報告記錄'),
  (30, 2025, 'annual', 8, null, null, 88038.72, 115682630, 115141521, null, null, 115141521, 15.0, 666152706, 666152706, 458781411, 31474350, '收支表 p8；裝置容量 p4；毛發電量 p5；淨發電量 p5；直轉供 p7；容量因數 p5', 'pdf', null, false, 'complete', '{}'::text[], null),
  (33, 2023, 'annual', 14, null, null, 67267.2, 11857420, 11798154, 64268605, null, null, 12.07, 473943156, 473943156, 298363254, 13184471, '收支表 p14；裝置容量 p4；毛發電量 p5；淨發電量 p6；售予台電 p10；容量因數 p7', 'pdf', null, false, 'complete', array['mismatch']::text[], '售予台電 64,268,605 度比毛發電量 11,857,420 度多很多，照報告記錄，建議優先抽查'),
  (33, 2024, 'annual', 14, null, null, 67267.2, 90331624, 90005988, 14313859, null, 76929564, 15.29, 500647113, 500647113, 334871208, 17290250, '收支表 p14；裝置容量 p4；毛發電量 p5；淨發電量 p6；售予台電 p10；直轉供 p11；容量因數 p7', 'pdf', null, false, 'complete', '{}'::text[], null),
  (26, 2025, 'annual', 3, null, null, 39100, 71894987, 70425967, 0, 0, 70425967, 20.99, null, null, null, null, '裝置容量 p3；毛發電量 p3；淨發電量 p3；售予台電 p5；售予售電業 p5；直轉供 p5；容量因數 p4', 'pdf', null, false, 'no_fin', '{}'::text[], null),
  (21, 2025, 'annual', 3, null, null, 96600, 183278924, 179494483, 0, 0, 179494483, 21.66, null, null, null, null, '裝置容量 p3；毛發電量 p3；淨發電量 p3；售予台電 p5；售予售電業 p5；直轉供 p5；容量因數 p4', 'pdf', null, false, 'no_fin', '{}'::text[], null),
  (28, 2025, 'annual', 3, null, null, 44100, 87925173, 86165593, 0, 0, 86165593, 22.76, null, null, null, null, '裝置容量 p3；毛發電量 p3；淨發電量 p3；售予台電 p5；售予售電業 p5；直轉供 p5；容量因數 p4', 'pdf', null, false, 'no_fin', '{}'::text[], null);

delete from company_financials where period = 'annual';
insert into company_financials (company_id, year, period, page, purchased_kwh, sold_kwh, capacity_kw, gross_generation_kwh, net_generation_kwh,
       sold_to_taipower_kwh, sold_to_retailers_kwh, sold_to_users_kwh, capacity_factor_pct,
       operating_revenue, electricity_revenue, operating_cost, operating_expense, pages, source, scanned, masked, status, flags, note)
select t.company_id, t.year, t.period, t.page, t.purchased_kwh, t.sold_kwh, t.capacity_kw, t.gross_generation_kwh, t.net_generation_kwh,
       t.sold_to_taipower_kwh, t.sold_to_retailers_kwh, t.sold_to_users_kwh, t.capacity_factor_pct,
       t.operating_revenue, t.electricity_revenue, t.operating_cost, t.operating_expense, t.pages, t.source, t.scanned, t.masked, t.status, t.flags, t.note
  from tmp_fin t join companies c on c.id = t.company_id;
drop table tmp_fin;

-- 3. 每度電的單價（推估）
--   售電業：售電單價 ≈ 電業收入 ÷ 售電量；購電成本 ≈ 營業成本 ÷ 購電量；價差 ＝ 兩者相減；
--           每度營業費用 ＝ 營業費用 ÷ 售電量；營業利益 ＝ 營業收入（和電業收入取較大的）− 營業成本 − 營業費用
--   發電業：售出電量 ＝ 售予台電＋售予售電業＋直／轉供（都沒有就用淨發電量）；
--           每度售電收入 ≈ 電業收入 ÷ 售出電量；每度營業成本 ≈ 營業成本 ÷ 售出電量
--   flags：fee＝電業收入每度不到 1 元，可能只認列服務費，不能當售電單價；cost_other＝營業成本不只購電；
--          mismatch＝報告裡的數字對不起來。網站會提醒，整體平均不採用這一年。
-- 先刪再建：021 之後表格多了欄位，直接 replace 會失敗（重跑 020 之後要再跑 021）
drop view if exists company_unit_metrics;
create view company_unit_metrics as
select f.*,
       c.role,
       round(f.electricity_revenue / nullif(f.sold_kwh, 0), 4)        as sale_price,
       round(f.operating_cost / nullif(f.purchased_kwh, 0), 4)        as purchase_cost,
       round(f.electricity_revenue / nullif(f.sold_kwh, 0) - f.operating_cost / nullif(f.purchased_kwh, 0), 4) as spread,
       round(f.operating_expense / nullif(f.sold_kwh, 0), 4)          as expense_per_kwh,
       -- 營業收入 ≥ 電業收入；有些報告營業收入那一列寫「-」或空白，所以取兩者較大的
       case when greatest(f.operating_revenue, f.electricity_revenue) is not null and f.operating_cost is not null and f.operating_expense is not null
            then greatest(f.operating_revenue, f.electricity_revenue) - f.operating_cost - f.operating_expense end as operating_income,
       s.sold_total,
       round(f.electricity_revenue / nullif(s.sold_total, 0), 4)      as revenue_per_kwh,
       round(f.operating_cost / nullif(s.sold_total, 0), 4)           as cost_per_kwh
  from company_financials f
  join companies c on c.id = f.company_id
  cross join lateral (select case when coalesce(f.sold_to_taipower_kwh, f.sold_to_retailers_kwh, f.sold_to_users_kwh) is null then f.net_generation_kwh
                                  else coalesce(f.sold_to_taipower_kwh, 0) + coalesce(f.sold_to_retailers_kwh, 0) + coalesce(f.sold_to_users_kwh, 0) end as sold_total) s;

-- view 不直接開放給網站；網站透過 api_company 讀
revoke all on company_unit_metrics from anon, authenticated;

-- 4. api_company：financials 讀上面的 view，並附上那一年年報的連結（用「公司＋年度」對應，不用報告編號：重跑 017 時編號會變）
create or replace function api_company(p_id int)
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with c as (select * from companies where id = p_id and role in ('retailer', 'generator'))
  select case when not exists (select 1 from c) then null else jsonb_build_object(
    'as_of', (select as_of from trec_year_totals order by year desc limit 1),
    'years', coalesce((select jsonb_agg(year order by year) from trec_year_totals), '[]'::jsonb),
    'company', (select to_jsonb(c) || jsonb_build_object(
        'rank', r.rank, 'cum_mwh', r.cum_mwh, 'case_count', r.case_count, 'capacity_kw', r.capacity_kw,
        'cap_matched', r.cap_matched, 'energies', r.energies, 'first_year', r.first_year,
        'issued_mwh', r.issued_mwh, 'remaining_mwh', r.remaining_mwh,
        'role_size', (select count(*) from company_rankings x where x.role = r.role))
        from c join company_rankings r on r.company_id = c.id),
    'by_year', coalesce((select jsonb_agg(jsonb_build_object(
        'year', y.year,
        'sold_mwh', (select round(sum(power_mwh), 3) from trec_direct_supply d where d.year = y.year and d.seller_name = (select name_zh from c)),
        'issued_mwh', (select round(sum(issued_mwh), 3) from trec_certificates t where t.year = y.year and t.holder_name = (select name_zh from c)),
        'remaining_mwh', (select round(sum(remaining_mwh), 3) from trec_certificates t where t.year = y.year and t.holder_name = (select name_zh from c))
      ) order by y.year) from trec_year_totals y), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(x order by x.sold_mwh desc) from (
        select d.case_id, max(d.case_name) as case_name, max(d.owner) as owner, max(d.energy) as energy,
               (select capacity_kw from trec_certificates t where t.case_id = d.case_id order by t.year desc limit 1) as capacity_kw,
               round(sum(d.power_mwh), 3) as sold_mwh, min(d.year) as first_year, max(d.year) as last_year
          from trec_direct_supply d where d.seller_name = (select name_zh from c)
         group by d.case_id) x), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(to_jsonb(r) - 'company_id' order by r.report_type, r.year desc, r.month desc nulls first)
        from company_reports r where r.company_id = p_id), '[]'::jsonb),
    'financials', coalesce((select jsonb_agg((to_jsonb(m) - 'company_id' - 'report_id') || jsonb_build_object(
          'report_url', (select r.url from company_reports r
                          where r.company_id = m.company_id and r.report_type = 'annual' and r.year = m.year and r.url is not null
                          order by (r.status = 'found') desc limit 1)) order by m.year)
        from company_unit_metrics m where m.company_id = p_id), '[]'::jsonb)
  ) end;
$$;

revoke execute on function api_company(int) from public;
grant  execute on function api_company(int) to anon, authenticated, service_role;

-- 檢查：應該是 94 列（售電業 55、發電業 39）
select c.role as 分類, count(*) as 年報數,
       count(*) filter (where f.status = 'complete') as 算得出單價,
       count(*) filter (where f.status = 'masked') as 遮蔽,
       count(*) filter (where f.status = 'missing') as 讀不到
  from company_financials f join companies c on c.id = f.company_id
 group by c.role order by c.role desc;
