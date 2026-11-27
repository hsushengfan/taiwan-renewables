-- =====================================================================
-- 022：上市櫃公開資訊（用財報推估營業收入和成本）
--
-- 為什麼：很多業者的電業簡明年報把收支遮住，但業者本身、或它的母公司是上市櫃（含興櫃）公司，
--   要在公開資訊觀測站公布財務報告和股東會年報。用這些官方文件補上營業收入、營業成本、營業利益。
-- 做了什麼：
--   1. 新資料表 company_public_filings：每家公司每年一列，記數字（一律換成「元」）、文件名稱和頁碼、網址
--   2. 匯入 data/company_public_filings.csv（72 列，17 家）
--   3. api_company 多回傳 filings（網站「上市櫃公開資訊」那一塊用）
-- 注意：財報的「營業收入」可能包含售電以外的業務；scope_ok = false 的業者差太多，網站不算每度電。
-- 說明見 docs/company-public-filings.md、docs/methodology.md。
--
-- 使用方式：整份複製（不是只複製檔名），在 SQL Editor 開新分頁貼上（下拉選單選 Database），按 Run。重複執行沒關係。
-- =====================================================================

-- 1. 資料表
create table if not exists company_public_filings (
  company_id        int  not null references companies(id),
  year              int  not null,
  source_type       text not null check (source_type in ('own_fs', 'own_ar', 'parent_ar')),  -- 自己的財報／自己的年報／母公司年報
  source_company    text,            -- 文件是哪家公司的（含股票代號）
  source_doc        text,            -- 文件名稱和頁碼
  source_url        text,            -- 文件網址
  unit_original     text,            -- 文件上的單位（元、千元；「（未標示）」表示該頁沒有寫）
  operating_revenue numeric,         -- 營業收入（元）
  operating_cost    numeric,         -- 營業成本（元；母公司年報沒有這一欄）
  operating_expense numeric,         -- 營業費用（元）
  operating_income  numeric,         -- 營業利益（元，負數是虧損）
  net_income        numeric,         -- 本期淨利／本期損益（元）
  status            text not null check (status in ('ok', 'not_disclosed', 'not_found', 'not_listed')),
  scope_ok          boolean not null default true,   -- false：營業收入包含很多售電以外的業務，不能拿來算每度電
  check_note        text,            -- 和簡明年報／月報對帳的結果
  note              text,
  created_at        timestamptz not null default now(),
  primary key (company_id, year)
);
alter table company_public_filings enable row level security;   -- 只能透過 api_company 讀
revoke all on company_public_filings from anon, authenticated;

-- 2. 資料（整批換掉）
delete from company_public_filings;
insert into company_public_filings (company_id, year, source_type, source_company, source_doc, source_url, unit_original,
       operating_revenue, operating_cost, operating_expense, operating_income, net_income, status, scope_ok, check_note, note)
select v.* from (values
  (16, 2022, 'parent_ar', '中租控股股份有限公司（5871）', '111 年度股東會年報 第 271 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=5871&filename=2022_5871_20230524F04.pdf', '仟元', 0, null::numeric, null::numeric, -226000, -194000, 'ok', true, null::text, '單位標示在前一頁（PDF 第 270 頁）；表上寫「-」，記為 0（當年還沒有營收）'),
  (16, 2023, 'parent_ar', '中租控股股份有限公司（5871）', '112 年度股東會年報 第 317 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=5871&filename=2023_5871_20240522F04.pdf', '仟元', 450000, null::numeric, null::numeric, 342000, 432000, 'ok', true, null::text, '單位標示在 PDF 第 316 頁'),
  (16, 2024, 'parent_ar', '中租控股股份有限公司（5871）', '113 年度股東會年報 第 154 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=5871&filename=2024_5871_20250528F04.pdf', '仟元', 883000, null::numeric, null::numeric, 326000, 388000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (16, 2025, 'parent_ar', '中租控股股份有限公司（5871）', '114 年度股東會年報 第 164 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=5871&filename=2025_5871_20260526F04.pdf', '仟元', 4874000, null::numeric, null::numeric, 4039000, 3422000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (18, 2021, 'parent_ar', '大亞電線電纜股份有限公司（1609）', '110 年度股東會年報 第 153 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=1609&filename=2021_1609_20220610F04.pdf', '仟元', 0, null::numeric, null::numeric, -86000, -70000, 'ok', true, null::text, '表上寫「-」，記為 0（當年還沒有營收）'),
  (18, 2022, 'parent_ar', '大亞電線電纜股份有限公司（1609）', '111 年度股東會年報 第 160 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=1609&filename=2022_1609_20230531F04.pdf', '仟元', 38708000, null::numeric, null::numeric, -136000, -107000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (18, 2023, 'parent_ar', '大亞電線電纜股份有限公司（1609）', '112 年度股東會年報 第 180 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=1609&filename=2023_1609_20240531F04.pdf', '仟元', 218056000, null::numeric, null::numeric, -285000, -65000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (18, 2024, 'parent_ar', '大亞電線電纜股份有限公司（1609）', '113 年度關係企業合併營業報告書（三書表專區）第 11 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=1609&filename=202404_1609_A20.pdf', '仟元', 160296000, null::numeric, null::numeric, 970000, 991000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (18, 2025, 'parent_ar', '大亞電線電纜股份有限公司（1609）', '114 年度關係企業合併營業報告書（三書表專區）第 10 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=1609&filename=202504_1609_A20.pdf', '仟元', 181531000, null::numeric, null::numeric, 1604000, 1939000, 'ok', true, null::text, null::text),
  (2, 2020, 'parent_ar', '台灣汽電共生股份有限公司（8926）', '109 年度股東會年報 第 291 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=8926&filename=2020_8926_20210624F04.pdf', '仟元', 4853000, null::numeric, null::numeric, 4051000, 11236000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (2, 2021, 'parent_ar', '台灣汽電共生股份有限公司（8926）', '110 年度股東會年報 第 291 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=8926&filename=2021_8926_20220531F04.pdf', '仟元', 13111000, null::numeric, null::numeric, 9167000, 16292000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (2, 2022, 'parent_ar', '台灣汽電共生股份有限公司（8926）', '111 年度股東會年報 第 304 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=8926&filename=2022_8926_20230626F04.pdf', '仟元', 28212000, null::numeric, null::numeric, 22216000, 21718000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (2, 2023, 'parent_ar', '台灣汽電共生股份有限公司（8926）', null::text, null::text, '（未標示）', null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, 'not_found', true, null::text, '找不到：112 年度年報文字中查無台汽電綠能的營運概況，112 年度也沒有三書表專區檔案'),
  (2, 2024, 'parent_ar', '台灣汽電共生股份有限公司（8926）', '113 年度關係企業合併營業報告書（三書表專區）第 6 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=8926&filename=202404_8926_A20.pdf', '仟元', 31547000, null::numeric, null::numeric, 25351000, 22349000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (2, 2025, 'parent_ar', '台灣汽電共生股份有限公司（8926）', '114 年度關係企業合併營業報告書（三書表專區）第 6 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=8926&filename=202504_8926_A20.pdf', '仟元', 48374000, null::numeric, null::numeric, 39898000, 36369000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (19, 2022, 'parent_ar', '大同股份有限公司（2371）', '111 年度股東會年報 PDF 第 106 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=2371&filename=2022_2371_20230616F04.pdf', '仟元', 2657267000, null::numeric, null::numeric, 34563000, 41753000, 'ok', false, '母公司年報上大同智能的營業收入每年 20 億元以上，但月報的電業收入每年只有數百萬到兩千多萬元，大部分營收不是售電，不能用來算每度電', '表格為旋轉排版'),
  (19, 2023, 'parent_ar', '大同股份有限公司（2371）', '112 年度股東會年報 第 135 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=2371&filename=2023_2371_20240531F04.pdf', '仟元', 2512302000, null::numeric, null::numeric, 71782000, 177666000, 'ok', false, '母公司年報上大同智能的營業收入每年 20 億元以上，但月報的電業收入每年只有數百萬到兩千多萬元，大部分營收不是售電，不能用來算每度電', '公司名稱在第 134 頁，數字在對頁第 135 頁同一列'),
  (19, 2024, 'parent_ar', '大同股份有限公司（2371）', '113 年度關係企業合併營業報告書（三書表專區）第 18 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=2371&filename=202404_2371_A20.pdf', '（未標示）', 2866619000, null::numeric, null::numeric, 36357000, 133023000, 'ok', false, '母公司年報上大同智能的營業收入每年 20 億元以上，但月報的電業收入每年只有數百萬到兩千多萬元，大部分營收不是售電，不能用來算每度電', '該頁沒有擷取到單位標示，請人工確認；文件該頁沒有擷取到單位，依前後年度推定為千元'),
  (19, 2025, 'parent_ar', '大同股份有限公司（2371）', '114 年度關係企業合併營業報告書（三書表專區）第 15 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=2371&filename=202504_2371_A20.pdf', '（未標示）', 2032443000, null::numeric, null::numeric, 10627000, 70608000, 'ok', false, '母公司年報上大同智能的營業收入每年 20 億元以上，但月報的電業收入每年只有數百萬到兩千多萬元，大部分營收不是售電，不能用來算每度電', '該頁沒有擷取到單位標示，請人工確認；文件該頁沒有擷取到單位，依前後年度推定為千元'),
  (1, 2021, 'own_fs', '天能綠電股份有限公司（7842）', null::text, null::text, '（未標示）', null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, 'not_disclosed', true, null::text, '沒有公開：公開資訊觀測站查無 110、111 年度財報或年報'),
  (1, 2022, 'own_fs', '天能綠電股份有限公司（7842）', null::text, null::text, '（未標示）', null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, 'not_disclosed', true, null::text, '沒有公開：公開資訊觀測站查無 110、111 年度財報或年報'),
  (1, 2023, 'own_fs', '天能綠電股份有限公司（7842）', '113 年度財務報告（個別）第 9 頁 綜合損益表（112 年度比較欄）', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=A&co_id=7842&filename=202404_7842_AI2.pdf', '仟元', 233892000, 216709000, 10196000, 6987000, 5870000, 'ok', true, null::text, '112 年度本身未申報財報，數字取自 113 年度財報的比較欄'),
  (1, 2024, 'own_ar', '天能綠電股份有限公司（7842）', '114 年度股東會年報 第 72～73 頁（最近二年度財務狀況及經營結果分析）', 'https://greenet.com.tw/upload/e411666e-2b10-4ed9-a483-a194def9084f.pdf', '千元', 1023704000, 972498000, 20033000, 31173000, 25215000, 'ok', true, null::text, '營業收入含售電以外的業務；113 年簡明年報的營業收入遮蔽為 *'),
  (1, 2025, 'own_ar', '天能綠電股份有限公司（7842）', '114 年度股東會年報 第 72～73 頁（最近二年度財務狀況及經營結果分析）', 'https://greenet.com.tw/upload/e411666e-2b10-4ed9-a483-a194def9084f.pdf', '千元', 2285077000, 2157781000, 53838000, 73458000, 59685000, 'ok', true, null::text, '營業收入含售電以外的業務；和 114 年簡明年報（遮蔽 *'),
  (3, 2020, 'own_fs', '富威電力股份有限公司（6994）', '110 年度財務報告（個別）第 9 頁 綜合損益表（109 年度比較欄）', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=A&co_id=6994&filename=202104_6994_AI2.pdf', '仟元', 95227000, 87392000, 6301000, 1534000, 1425000, 'ok', true, null::text, '109 年度本身未申報財報'),
  (3, 2021, 'own_fs', '富威電力股份有限公司（6994）', '110 年度財務報告（個別）第 9 頁 綜合損益表', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=A&co_id=6994&filename=202104_6994_AI2.pdf', '仟元', 157250000, 133156000, 21596000, 2498000, 2082000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (3, 2022, 'own_fs', '富威電力股份有限公司（6994）', '112 年度合併財務報告 第 11 頁 綜合損益表（111 年度比較欄）', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=A&co_id=6994&filename=202304_6994_AI1.pdf', '仟元', 362250000, 289984000, 38195000, 34071000, 25883000, 'ok', true, '和簡明年報的營業收入相符', '與 111 年度財報 202204_6994_AI5（標示重編後）第 9 頁數字相同'),
  (3, 2023, 'own_fs', '富威電力股份有限公司（6994）', '112 年度合併財務報告 第 11 頁 綜合損益表', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=A&co_id=6994&filename=202304_6994_AI1.pdf', '仟元', 879893000, 768562000, 65701000, 45630000, 56201000, 'ok', true, '112 年起是合併財務報告（含子公司），比簡明年報多 5.5%', null::text),
  (3, 2024, 'own_fs', '富威電力股份有限公司（6994）', '113 年度合併財務報告 第 11 頁 綜合損益表', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=A&co_id=6994&filename=202404_6994_AI1.pdf', '仟元', 1886585000, 1588609000, 122866000, 175110000, 84554000, 'ok', true, null::text, null::text),
  (3, 2025, 'own_fs', '富威電力股份有限公司（6994）', '114 年度合併財務報告 第 12 頁 綜合損益表', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=A&co_id=6994&filename=202504_6994_AI1.pdf', '仟元', 4990058000, 3777864000, 251411000, 704881000, 454339000, 'ok', true, null::text, '營業毛利後另有未實現銷貨利益 (255,902)'),
  (11, 2023, 'parent_ar', '寶晶能源股份有限公司（6987）', null::text, null::text, '（未標示）', null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, 'not_disclosed', true, null::text, '沒有公開：寶晶沒有 112 年度股東會年報（113 年只有臨時會資料）'),
  (11, 2024, 'parent_ar', '寶晶能源股份有限公司（6987）', '113 年度關係企業合併營業報告書（三書表專區）第 9 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=6987&filename=202404_6987_A20.pdf', '仟元', 1516000, null::numeric, null::numeric, -4936000, -3880000, 'ok', true, null::text, null::text),
  (11, 2025, 'parent_ar', '寶晶能源股份有限公司（6987）', '114 年度關係企業合併營業報告書（三書表專區）第 9 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=6987&filename=202504_6987_A20.pdf', '仟元', 641853000, null::numeric, null::numeric, 976000, 1158000, 'ok', true, null::text, null::text),
  (17, 2022, 'parent_ar', '康舒科技股份有限公司（6282）', '111 年度股東會年報 第 146 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=6282&filename=2022_6282_20230526F04.pdf', '千元', 0, null::numeric, null::numeric, 326000, -325000, 'ok', true, null::text, '旋轉排版；營業利益照文件印「326」（無括號），本期損益為 (325)'),
  (17, 2023, 'parent_ar', '康舒科技股份有限公司（6282）', '112 年度股東會年報 第 151 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=6282&filename=2023_6282_20240620F04.pdf', '千元', 8745000, null::numeric, null::numeric, 3198000, 2560000, 'ok', true, null::text, '旋轉排版'),
  (17, 2024, 'parent_ar', '康舒科技股份有限公司（6282）', '113 年度關係企業合併營業報告書（三書表專區）第 12 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=6282&filename=202404_6282_A20.pdf', '千元', 93115000, null::numeric, null::numeric, 13020000, 10477000, 'ok', true, null::text, null::text),
  (17, 2025, 'parent_ar', '康舒科技股份有限公司（6282）', '114 年度關係企業合併營業報告書（三書表專區）第 8 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=6282&filename=202504_6282_A20.pdf', '千元', 20350000, null::numeric, null::numeric, 19338000, 14504000, 'ok', true, null::text, null::text),
  (7, 2022, 'parent_ar', '怡和國際能源股份有限公司（7590）', null::text, null::text, '（未標示）', null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, 'not_listed', true, null::text, '沒有列出：怡和國際 111 年度年報關係企業表內沒有怡和綠電超商'),
  (7, 2023, 'parent_ar', '怡和國際能源股份有限公司（7590）', '112 年度股東會年報 第 201 頁 各關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=7590&filename=2023_7590_20240624F04.pdf', '仟元', 0, null::numeric, null::numeric, -2266000, -1813000, 'ok', true, null::text, null::text),
  (7, 2024, 'parent_ar', '怡和國際能源股份有限公司（7590）', '113 年度關係企業合併營業報告書（三書表專區）PDF 第 8 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=7590&filename=202404_7590_A20.pdf', '仟元', 230000, null::numeric, null::numeric, -10072000, -7582000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (7, 2025, 'parent_ar', '怡和國際能源股份有限公司（7590）', '114 年度關係企業合併營業報告書（三書表專區）PDF 第 8 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=7590&filename=202504_7590_A20.pdf', '仟元', 1074526000, null::numeric, null::numeric, -27823000, -23636000, 'ok', true, null::text, null::text),
  (4, 2021, 'parent_ar', '泓德能源科技股份有限公司（6873）', '110 年度股東會年報 第 104 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=6873&filename=2021_6873_20220630F04.pdf', '（未標示）', 0, null::numeric, null::numeric, -352000, -352000, 'ok', true, null::text, '該頁沒有擷取到單位標示，請人工確認；文件該頁沒有擷取到單位，依前後年度推定為千元；表上寫「-」，記為 0（當年還沒有營收）'),
  (4, 2022, 'parent_ar', '泓德能源科技股份有限公司（6873）', null::text, null::text, '（未標示）', null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, 'not_found', true, null::text, '找不到：泓德 111 年度年報文字中查無星星電力的營運概況'),
  (4, 2023, 'parent_ar', '泓德能源科技股份有限公司（6873）', null::text, null::text, '（未標示）', null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, 'not_found', true, null::text, '找不到：泓德 112 年度年報文字中查無星星電力的營運概況'),
  (4, 2024, 'parent_ar', '泓德能源科技股份有限公司（6873）', '113 年度關係企業合併營業報告書（三書表專區）第 8 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=6873&filename=202404_6873_A20.pdf', '仟元', 59953000, null::numeric, null::numeric, 40105000, 32235000, 'ok', true, null::text, null::text),
  (4, 2025, 'parent_ar', '泓德能源科技股份有限公司（6873）', '114 年度關係企業合併營業報告書（三書表專區）第 12 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=6873&filename=202504_6873_A20.pdf', '千元', 1209892000, null::numeric, null::numeric, 126372000, 97976000, 'ok', true, null::text, null::text),
  (5, 2023, 'parent_ar', '中美矽晶製品股份有限公司（5483）', '112 年度股東會年報 第 144 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=5483&filename=2023_5483_20240620F04.pdf', '千元', 34781000, null::numeric, null::numeric, -3431000, -1455000, 'ok', true, '和簡明年報的營業收入相符', '續升綠能（7931）無年報，改用中美矽晶；表格為旋轉排版'),
  (5, 2024, 'parent_ar', '中美矽晶製品股份有限公司（5483）', '113 年度關係企業合併營業報告書（三書表專區）第 14 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=5483&filename=202404_5483_A20.pdf', '千元', 218917000, null::numeric, null::numeric, -6016000, -3243000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (5, 2025, 'parent_ar', '中美矽晶製品股份有限公司（5483）', '114 年度關係企業合併營業報告書（三書表專區）第 16 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=5483&filename=202504_5483_A20.pdf', '千元', 725117000, null::numeric, null::numeric, 8050000, 8970000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (13, 2022, 'parent_ar', '台灣水泥股份有限公司（1101）', '111 年度股東會年報 PDF 第 132 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=1101&filename=2022_1101_20230531F04.pdf', '仟元', 0, null::numeric, null::numeric, -404000, -401000, 'ok', false, '母公司年報的營業收入是月報全年電業收入的 2～3 倍，包含售電以外的業務，不能用來算每度電', '註五：能元超商於 111 年 8 月 1 日成立；表上寫「-」，記為 0（當年還沒有營收）'),
  (13, 2023, 'parent_ar', '台灣水泥股份有限公司（1101）', '112 年度股東會年報 第 139 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=1101&filename=2023_1101_20240521F04.pdf', '仟元', 15080000, null::numeric, null::numeric, 9760000, 8051000, 'ok', false, '母公司年報的營業收入是月報全年電業收入的 2～3 倍，包含售電以外的業務，不能用來算每度電', null::text),
  (13, 2024, 'parent_ar', '台灣水泥股份有限公司（1101）', '113 年度關係企業合併營業報告書（三書表專區）第 29 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=1101&filename=202404_1101_A20.pdf', '仟元', 51344000, null::numeric, null::numeric, 46651000, 38448000, 'ok', false, '母公司年報的營業收入是月報全年電業收入的 2～3 倍，包含售電以外的業務，不能用來算每度電', null::text),
  (13, 2025, 'parent_ar', '台灣水泥股份有限公司（1101）', '114 年度關係企業合併營業報告書（三書表專區）第 29 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=1101&filename=202504_1101_A20.pdf', '仟元', 64149000, null::numeric, null::numeric, 53185000, 44161000, 'ok', false, '母公司年報的營業收入是月報全年電業收入的 2～3 倍，包含售電以外的業務，不能用來算每度電', null::text),
  (8, 2023, 'parent_ar', '中美矽晶製品股份有限公司（5483）', null::text, null::text, '（未標示）', null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, 'not_listed', true, null::text, '沒有列出：中美矽晶 112 年度年報關係企業表內沒有艾涅爾'),
  (8, 2024, 'parent_ar', '中美矽晶製品股份有限公司（5483）', '113 年度關係企業合併營業報告書（三書表專區）第 14 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=5483&filename=202404_5483_A20.pdf', '千元', null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, 'not_disclosed', true, null::text, '名稱旁標註「註 3」，只列資本額、資產、負債、淨值；營業收入、營業利益、本期損益欄為「－」'),
  (8, 2025, 'parent_ar', '中美矽晶製品股份有限公司（5483）', '114 年度關係企業合併營業報告書（三書表專區）第 16 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=5483&filename=202504_5483_A20.pdf', '千元', 752703000, null::numeric, null::numeric, 11340000, 9451000, 'ok', true, '比簡明年報多 10.2%，可能包含售電以外的收入', null::text),
  (10, 2022, 'own_fs', '阿波羅電力股份有限公司（7911）', null::text, null::text, '（未標示）', null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, 'not_disclosed', true, null::text, '沒有公開：公開資訊觀測站查無 111、112 年度財報或年報'),
  (10, 2023, 'own_fs', '阿波羅電力股份有限公司（7911）', null::text, null::text, '（未標示）', null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, 'not_disclosed', true, null::text, '沒有公開：公開資訊觀測站查無 111、112 年度財報或年報'),
  (10, 2024, 'own_fs', '阿波羅電力股份有限公司（7911）', '114 年度合併財務報告 第 8 頁（PDF 頁）綜合損益表（113 年度比較欄）', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=A&co_id=7911&filename=202504_7911_AI1.pdf', '仟元', 151545000, 145362000, 44907000, -38724000, -30835000, 'ok', true, '合併財務報告（含子公司），比簡明年報多 2.1%', '113 年度本身未申報財報；報表為掃描影像，以目視抄錄'),
  (10, 2025, 'own_fs', '阿波羅電力股份有限公司（7911）', '114 年度合併財務報告 第 8 頁（PDF 頁）綜合損益表', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=A&co_id=7911&filename=202504_7911_AI1.pdf', '仟元', 1325579000, 1203929000, 144082000, -32535000, -27845000, 'ok', true, null::text, '報表為掃描影像，以目視抄錄；營業毛利後另有未實現銷貨利益 (10,103)'),
  (34, 2022, 'parent_ar', '中國鋼鐵股份有限公司（2002）', '111 年度股東會年報 第 272 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=2002&filename=2022_2002_20230616F04.pdf', '千元', 482647000, null::numeric, null::numeric, 175883000, 121014000, 'ok', false, '母公司年報的營業收入比月報的電業收入多很多（2024 年多 54%），包含售電以外的收入，不能用來算每度電', '旋轉排版；單位標示在 PDF 第 271 頁'),
  (34, 2023, 'parent_ar', '中國鋼鐵股份有限公司（2002）', '112 年度股東會年報 第 269 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=2002&filename=2023_2002_20240619F04.pdf', '千元', 527517000, null::numeric, null::numeric, 180168000, 116446000, 'ok', false, '母公司年報的營業收入比月報的電業收入多很多（2024 年多 54%），包含售電以外的收入，不能用來算每度電', '旋轉排版；單位標示在 PDF 第 268 頁'),
  (34, 2024, 'parent_ar', '中國鋼鐵股份有限公司（2002）', '113 年度關係企業合併營業報告書（三書表專區）第 23 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=2002&filename=202404_2002_A20.pdf', '千元', 564762000, null::numeric, null::numeric, 178138000, 132135000, 'ok', false, '母公司年報的營業收入比月報的電業收入多很多（2024 年多 54%），包含售電以外的收入，不能用來算每度電', null::text),
  (34, 2025, 'parent_ar', '中國鋼鐵股份有限公司（2002）', '114 年度關係企業合併營業報告書（三書表專區）第 24 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=2002&filename=202504_2002_A20.pdf', '千元', 583820000, null::numeric, null::numeric, 174634000, 115936000, 'ok', false, '母公司年報的營業收入比月報的電業收入多很多（2024 年多 54%），包含售電以外的收入，不能用來算每度電', null::text),
  (37, 2022, 'parent_ar', '中興電工機械股份有限公司（1513）', '111 年度股東會年報 第 267 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=1513&filename=2022_1513_20230524F04.pdf', '仟元', 570130000, null::numeric, null::numeric, 150068000, 6723000, 'ok', true, '和簡明年報的營業收入相符', '旋轉排版'),
  (37, 2023, 'parent_ar', '中興電工機械股份有限公司（1513）', '112 年度股東會年報 第 278 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=1513&filename=2023_1513_20240527F04.pdf', '仟元', 563583000, null::numeric, null::numeric, 133966000, -3522000, 'ok', true, '和簡明年報的營業收入相符', '旋轉排版'),
  (37, 2024, 'parent_ar', '中興電工機械股份有限公司（1513）', '113 年度關係企業合併營業報告書（三書表專區）第 9 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=1513&filename=202404_1513_A20.pdf', '仟元', 562756000, null::numeric, null::numeric, 132577000, 15074000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (37, 2025, 'parent_ar', '中興電工機械股份有限公司（1513）', '114 年度關係企業合併營業報告書（三書表專區）第 9 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=1513&filename=202504_1513_A20.pdf', '仟元', 610887000, null::numeric, null::numeric, 173302000, 67197000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (31, 2022, 'parent_ar', '中興電工機械股份有限公司（1513）', '111 年度股東會年報 第 267 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=1513&filename=2022_1513_20230524F04.pdf', '仟元', 839002000, null::numeric, null::numeric, 211715000, 4309000, 'ok', true, '和簡明年報的營業收入相符', '旋轉排版'),
  (31, 2023, 'parent_ar', '中興電工機械股份有限公司（1513）', '112 年度股東會年報 第 278 頁 關係企業營運概況', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=1513&filename=2023_1513_20240527F04.pdf', '仟元', 829782000, null::numeric, null::numeric, 206406000, 14898000, 'ok', true, '和簡明年報的營業收入相符', '旋轉排版'),
  (31, 2024, 'parent_ar', '中興電工機械股份有限公司（1513）', '113 年度關係企業合併營業報告書（三書表專區）第 9 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=1513&filename=202404_1513_A20.pdf', '仟元', 827601000, null::numeric, null::numeric, 181405000, 29434000, 'ok', true, '和簡明年報的營業收入相符', null::text),
  (31, 2025, 'parent_ar', '中興電工機械股份有限公司（1513）', '114 年度關係企業合併營業報告書（三書表專區）第 9 頁', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=K&co_id=1513&filename=202504_1513_A20.pdf', '仟元', 957584000, null::numeric, null::numeric, 307157000, 170280000, 'ok', true, '和簡明年報的營業收入相符', null::text)
) as v(company_id, year, source_type, source_company, source_doc, source_url, unit_original,
       operating_revenue, operating_cost, operating_expense, operating_income, net_income, status, scope_ok, check_note, note)
join companies c on c.id = v.company_id;

-- 3. api_company 加上 filings
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
          -- 年報：用「公司＋年度」對到年報連結；月報：資料裡已經存了那一份月報的連結
          'report_url', coalesce(m.report_url, case when m.period = 'annual' then (select r.url from company_reports r
                          where r.company_id = m.company_id and r.report_type = 'annual' and r.year = m.year and r.url is not null
                          order by (r.status = 'found') desc limit 1) end)) order by m.year, m.period, m.month nulls first)
        from company_unit_metrics m where m.company_id = p_id), '[]'::jsonb),
    -- 上市櫃公開資訊（業者自己的財報、或母公司年報的關係企業資料），022 加的
    'filings', coalesce((select jsonb_agg(to_jsonb(p) - 'company_id' - 'created_at' order by p.year)
        from company_public_filings p where p.company_id = p_id), '[]'::jsonb)
  ) end;
$$;



revoke execute on function api_company(int) from public;
grant  execute on function api_company(int) to anon, authenticated, service_role;

-- 檢查：應該是 72 列、17 家
select count(*) as 列數, count(distinct company_id) as 家數,
       count(*) filter (where status = 'ok') as 有數字, count(*) filter (where not scope_ok) as 範圍不同
  from company_public_filings;
