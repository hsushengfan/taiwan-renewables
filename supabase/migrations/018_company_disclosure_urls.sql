-- =====================================================================
-- 018：記錄每家業者的「年報、月報公開頁」網址（companies.disclosure_url）
--
-- 為什麼：業者小檔案頁的「公開資訊頁」欄會連到這裡，讓使用者自己去看原始檔案。
-- 做了什麼：更新前 40 名裡 39 家的 disclosure_url（33 家是使用者 2026-11-23 提供的網址，
--   6 家是 Claude 在第 2 階段找到的）。花蓮綠能還沒有找到，維持空值。
--
-- 使用方式：整份複製（不是只複製檔名），在 SQL Editor 開新分頁貼上（下拉選單選 Database），按 Run。重複執行沒關係。
-- =====================================================================

update companies c
   set disclosure_url = v.url
  from (values
  ('中曜股份有限公司', 'https://powergeneration.chailease.com.tw/announcement'),   -- 使用者提供（2026-11-23）
  ('博曜電力股份有限公司', 'https://www.taya.com.tw/bo-yao-electric'),   -- 使用者提供（2026-11-23）
  ('台汽電綠能股份有限公司', 'https://www.tccgreenenergy.com.tw/Laws?cid=682'),   -- 使用者提供（2026-11-23）
  ('大同智能股份有限公司', 'https://www.tatungforeverenergy.com/CompanyReport/Index'),   -- 使用者提供（2026-11-23）
  ('大自然能源電業股份有限公司', 'https://www.naturalpower.com.tw/#/report'),   -- 使用者提供（2026-11-23）
  ('天能綠電股份有限公司', 'https://greenet.com.tw/additionalInfo.aspx'),   -- 使用者提供（2026-11-23）
  ('富威電力股份有限公司', 'https://www.fwp.com.tw/Investor'),   -- 使用者提供（2026-11-23）
  ('寶富電力股份有限公司', 'https://www.inaenergy.com.tw/investor.php'),   -- 使用者提供（2026-11-23）
  ('康展電力股份有限公司', 'https://www.actelpower.com/news.php?news_id=2&page=2'),   -- 使用者提供（2026-11-23）
  ('星星電力股份有限公司', 'https://startrade-power.com/downloads/'),   -- 使用者提供（2026-11-23）
  ('晨星電力股份有限公司', 'https://www.risingstarenergy.com.tw/report'),   -- 使用者提供（2026-11-23）
  ('續興股份有限公司', 'https://sas-ses.energy/monthly-report/'),   -- 使用者提供（2026-11-23）
  ('能元超商股份有限公司', 'https://www.gempower.energy/powerMonthlyReport.html'),   -- 使用者提供（2026-11-23）
  ('開陽電力股份有限公司', 'https://powermaster.com.tw/reports/'),   -- 使用者提供（2026-11-23）
  ('阿波羅電力股份有限公司', 'https://re100.com.tw/投資人關係/'),   -- 使用者提供（2026-11-23）
  ('陽光伏特家電力股份有限公司', 'https://electricitysunnyfounder.wordpress.com'),   -- 使用者提供（2026-11-23）
  ('中威風力發電股份有限公司', 'https://www.wpd.tw/reports/'),   -- 使用者提供（2026-11-23）
  ('中鋼光能股份有限公司', 'https://www.cscphoto.com.tw/Pub_Month'),   -- 使用者提供（2026-11-23）
  ('創維風力發電股份有限公司', 'https://www.wpd.tw/reports/'),   -- 使用者提供（2026-11-23）
  ('台灣艾貴太陽能源股份有限公司', 'https://venaenergy.tw/our-news/information/'),   -- 使用者提供（2026-11-23）
  ('大彰化西北離岸風力發電股份有限公司', 'https://orsted.tw/zh/renewable-energy-solutions/offshore-wind/our-projects/chw4#FIN'),   -- 使用者提供（2026-11-23）
  ('天篷能源股份有限公司', 'https://chweb.chem.com.tw/Enterprise/_layout/Forms/ElecReport/ElecReportYear.aspx?muNodeID=2292&comp=3053'),   -- 使用者提供（2026-11-23）
  ('天衝能源股份有限公司', 'https://chweb.chem.com.tw/Enterprise/_layout/Forms/ElecReport/ElecReportYear.aspx?muNodeID=2292&comp=3052'),   -- 使用者提供（2026-11-23）
  ('安威風力發電股份有限公司', 'https://www.wpd.tw/reports/'),   -- 使用者提供（2026-11-23）
  ('新源風力發電股份有限公司', 'https://www.wpd.tw/reports/'),   -- 使用者提供（2026-11-23）
  ('星崙電業股份有限公司', 'https://www.asterrenewable.com.tw/monthly-report-category/星崙電業/'),   -- 使用者提供（2026-11-23）
  ('曄恆能源股份有限公司', 'https://www.formosasolar.com.tw/zh-tw/download.php?act=list&cid=9'),   -- 使用者提供（2026-11-23）
  ('立為風力發電股份有限公司', 'https://www.wpd.tw/reports/'),   -- 使用者提供（2026-11-23）
  ('茂正能源股份有限公司', 'https://www.starshining.com.tw/zh-tw/download/monthly-reports-eco-monitoring/index'),   -- 使用者提供（2026-11-23）
  ('觀威風力發電股份有限公司', 'https://www.wpd.tw/reports/'),   -- 使用者提供（2026-11-23）
  ('通威風力發電股份有限公司', 'https://www.wpd.tw/reports/'),   -- 使用者提供（2026-11-23）
  ('鹿威風力發電股份有限公司', 'https://www.wpd.tw/reports/'),   -- 使用者提供（2026-11-23）
  ('龍威風力發電股份有限公司', 'https://www.wpd.tw/reports/'),   -- 使用者提供（2026-11-23）
  ('怡和綠電超商股份有限公司', 'https://www.yihoget.com.tw/news-center/report'),   -- Claude 找到（2026-11-23）
  ('艾涅爾電力股份有限公司', 'https://annealenergy.com.tw/綠電公開資訊'),   -- Claude 找到（2026-11-23）
  ('瓦特先生股份有限公司', 'https://www.mrwatt.com.tw/power-report'),   -- Claude 找到（2026-11-23）
  ('辰亞電力股份有限公司', 'https://www.chenya-energy.com/monthly_report/'),   -- Claude 找到（2026-11-23）
  ('厚固光電股份有限公司', 'https://www.chenya-energy.com/monthly_report/'),   -- Claude 找到（2026-11-23）
  ('辰華電力股份有限公司', 'https://www.chenya-energy.com/monthly_report/')    -- Claude 找到（2026-11-23）
  ) as v(name_zh, url)
 where c.name_zh = v.name_zh;

-- 檢查：前 40 名裡，有公開頁網址的應該是 39 家，沒有的是花蓮綠能
select count(*) filter (where c.disclosure_url is not null) as 有網址,
       string_agg(c.short_name_zh, '、') filter (where c.disclosure_url is null) as 還沒有網址
  from company_rankings r join companies c on c.id = r.company_id
 where r.rank <= 20;
