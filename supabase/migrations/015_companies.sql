-- =====================================================================
-- 015：售電業／發電業排名與業者小檔案（規格見 docs/specs/companies.md）
--
-- 為什麼：用 T-REC（國家再生能源憑證中心）的公開資料，排出再生能源售電業和發電業前 20 名，
--   每家業者有自己的小檔案頁。T-REC 的資料由 Edge Function trec-sync 每月自動抓（排程見 016）。
--
-- 做了什麼：
--   1. companies              業者基本資料（先放規格第 3 節的 40 家，加上台電、中華紙漿）
--   2. trec_certificates      T-REC 已發放憑證（一列＝一個案場的一年）
--   3. trec_direct_supply     T-REC 直轉供成交紀錄（排名用；一列＝一年內某出售單位把某案場的憑證賣給某買方）
--   4. trec_self_use_trades   T-REC 自用發電設備成交紀錄（對帳用）
--   5. trec_year_totals       每一年 T-REC 公布的總量和我們的加總（驗算用）
--   6. trec_sync_runs         每次自動抓取的紀錄（成功或失敗、原因）
--   7. trec_staging           自動抓取時的暫存區（全部驗算通過才一次搬進正式資料表）
--   8. company_reports、company_financials  第 2、3 階段用，先建好
--   9. view company_rankings、trec_unknown_sellers
--   10. 給網站讀的函式 api_company_rankings()、api_company(id)；給自動抓取用的 trec_commit()
--
-- 主鍵說明：T-REC 每個案場都有編號（case_id）。同一個持有人可能有兩個同名案場（例如國泰人壽），
--   所以已發放憑證用 (year, case_id) 當主鍵，不用案場名稱。
--
-- 使用方式：整份複製（不是只複製檔名），在 SQL Editor 開新分頁貼上（下拉選單選 Database），按 Run。
-- 重複執行沒關係。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. companies：業者基本資料
--    role：retailer 售電業｜generator 發電業｜taipower 台電（排除）
--          excluded 不在能源署名單（例如自用發電設備）｜pending 自動抓取發現的新業者，等使用者確認分類
--    分類以能源署公布的名單為準（售電業 menu_id=8887、民營再生能源發電廠 menu_id=1001）。
-- ---------------------------------------------------------------------
create table if not exists companies (
  id                  serial primary key,
  name_zh             text not null unique,   -- 全名，和 T-REC 的名稱完全一樣
  short_name_zh       text not null,
  name_en             text,
  role                text not null check (role in ('retailer', 'generator', 'taipower', 'excluded', 'pending')),
  registry_checked_on date,                   -- 和能源署名單核對的日期
  registry_note       text,                   -- 例如「尚未列入能源署發電廠名單」
  website             text,
  disclosure_url      text,                   -- 依電業法第 66 條公開資訊的頁面
  stock_code          text,                   -- 上市櫃代號
  note_zh             text,
  note_en             text
);

insert into companies (name_zh, short_name_zh, role, registry_checked_on, registry_note, website, disclosure_url, stock_code, note_zh, note_en) values
  -- 售電業前 20 名（規格 3-1）
  ('天能綠電股份有限公司',       '天能綠電',   'retailer', '2026-11-22', null, null, 'https://greenet.com.tw/additionalInfo.aspx', '7842', null, null),
  ('台汽電綠能股份有限公司',     '台汽電綠能', 'retailer', '2026-11-22', null, null, null, null, null, null),
  ('富威電力股份有限公司',       '富威電力',   'retailer', '2026-11-22', null, null, 'https://www.fwp.com.tw/Investor', '6994', '另見 https://www.shinfox.com.tw/report_foxwell.html', null),
  ('星星電力股份有限公司',       '星星電力',   'retailer', '2026-11-22', null, null, 'https://startrade-power.com/downloads/', null, null, null),
  ('續興股份有限公司',           '續興',       'retailer', '2026-11-22', null, null, 'https://sas-ses.energy/monthly-report/', null, null, null),
  ('陽光伏特家電力股份有限公司', '陽光伏特家', 'retailer', '2026-11-22', null, null, 'https://electricitysunnyfounder.wordpress.com/', null, '舊月報另放 power-generation.sunnyfounder.com', null),
  ('怡和綠電超商股份有限公司',   '怡和綠電',   'retailer', '2026-11-22', null, null, null, null, null, null),
  ('艾涅爾電力股份有限公司',     '艾涅爾電力', 'retailer', '2026-11-22', null, null, 'https://annealenergy.com.tw/綠電公開資訊', null, null, null),
  ('晨星電力股份有限公司',       '晨星電力',   'retailer', '2026-11-22', null, 'https://www.risingstarenergy.com.tw/', null, null, null, null),
  ('阿波羅電力股份有限公司',     '阿波羅電力', 'retailer', '2026-11-22', null, null, 'https://re100.com.tw/電業年報/', '7911', null, null),
  ('寶富電力股份有限公司',       '寶富電力',   'retailer', '2026-11-22', null, null, null, null, null, null),
  ('大自然能源電業股份有限公司', '大自然能源', 'retailer', '2026-11-22', null, 'https://naturalpower.com.tw/', null, null, null, null),
  ('能元超商股份有限公司',       '能元超商',   'retailer', '2026-11-22', null, null, null, null, null, null),
  ('開陽電力股份有限公司',       '開陽電力',   'retailer', '2026-11-22', null, null, null, null, null, null),
  ('花蓮綠能股份有限公司',       '花蓮綠能',   'retailer', '2026-11-22', null, null, null, null, null, null),
  ('中曜股份有限公司',           '中曜',       'retailer', '2026-11-22', null, null, null, null, null, null),
  ('康展電力股份有限公司',       '康展電力',   'retailer', '2026-11-22', null, null, null, null, null, null),
  ('博曜電力股份有限公司',       '博曜電力',   'retailer', '2026-11-22', null, null, null, null, null, null),
  ('大同智能股份有限公司',       '大同智能',   'retailer', '2026-11-22', null, 'https://www.tatungforeverenergy.com/', null, null, null, null),
  ('瓦特先生股份有限公司',       '瓦特先生',   'retailer', '2026-11-22', null, null, 'https://www.mrwatt.com.tw/power-report', null, null, null),
  -- 發電業前 20 名（規格 3-2）
  ('鹿威風力發電股份有限公司',         '鹿威風力',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('中威風力發電股份有限公司',         '中威風力',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('台灣艾貴太陽能源股份有限公司',     '台灣艾貴',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('大彰化西北離岸風力發電股份有限公司', '大彰化西北', 'generator', '2026-11-22', '尚未列入能源署發電廠名單', null, null, null,
     '2025 年商轉的離岸風場，能源署民營再生能源發電廠名單（115-01-26 更新）還沒列入，本站依實際營運列為發電業。',
     'An offshore wind farm that began commercial operation in 2025. It is not yet on the Energy Administration list of private renewable power plants (updated 2026-01-26); this site lists it as a generator based on its actual operation.'),
  ('創維風力發電股份有限公司',         '創維風力',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('通威風力發電股份有限公司',         '通威風力',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('觀威風力發電股份有限公司',         '觀威風力',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('龍威風力發電股份有限公司',         '龍威風力',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('立為風力發電股份有限公司',         '立為風力',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('辰亞電力股份有限公司',             '辰亞電力',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('天衝能源股份有限公司',             '天衝能源',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('茂正能源股份有限公司',             '茂正能源',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('辰華電力股份有限公司',             '辰華電力',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('中鋼光能股份有限公司',             '中鋼光能',     'generator', '2026-11-22', null, null, 'https://www.cscphoto.com.tw/pub_year', null,
     '不在售電業名單，用自有案場直接轉供。月報：https://www.cscphoto.com.tw/pub_month',
     'Not on the retailer list; it sells power from its own plants directly to buyers.'),
  ('厚固光電股份有限公司',             '厚固光電',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('星崙電業股份有限公司',             '星崙電業',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('天篷能源股份有限公司',             '天篷能源',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('曄恆能源股份有限公司',             '曄恆能源',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('安威風力發電股份有限公司',         '安威風力',     'generator', '2026-11-22', null, null, null, null, null, null),
  ('新源風力發電股份有限公司',         '新源風力',     'generator', '2026-11-22', null, null, null, null, null, null),
  -- 不列入排名
  ('台灣電力股份有限公司', '台電',     'taipower', '2026-11-22', null, null, null, null, '排名排除台電。', 'Taipower is excluded from the rankings.'),
  ('中華紙漿股份有限公司', '中華紙漿', 'excluded', '2026-11-22', '不在能源署售電業、發電廠名單', null, null, null,
     '自用發電設備，憑證走自用發電設備成交紀錄，不列入排名。', 'A self-use generation facility; not ranked.')
on conflict (name_zh) do update
  set short_name_zh = excluded.short_name_zh, role = excluded.role, registry_checked_on = excluded.registry_checked_on,
      registry_note = excluded.registry_note, website = excluded.website, disclosure_url = excluded.disclosure_url,
      stock_code = excluded.stock_code, note_zh = excluded.note_zh, note_en = excluded.note_en;


-- ---------------------------------------------------------------------
-- 2. trec_certificates：T-REC 已發放憑證（https://www.trec.org.tw/certification）
--    發放量 issued_mwh ＝ 已移轉 traded_mwh ＋ 尚未移轉 remaining_mwh
-- ---------------------------------------------------------------------
create table if not exists trec_certificates (
  year          int not null,
  case_id       int not null,               -- T-REC 的案場編號
  holder_name   text not null,              -- 憑證持有人
  case_name     text not null,
  energy        text,
  capacity_kw   numeric,                    -- 裝置容量（kW）
  issued_mwh    numeric not null,
  traded_mwh    numeric not null,
  remaining_mwh numeric not null,
  as_of         text not null,              -- 抓的是到哪個月的資料，例如 2026-11
  fetched_at    timestamptz not null default now(),
  primary key (year, case_id)
);
create index if not exists trec_certificates_holder on trec_certificates (holder_name);


-- ---------------------------------------------------------------------
-- 3. trec_direct_supply：T-REC 直轉供憑證成交紀錄（排名用）
--    seller_name 出售單位（排名就是依它加總）、owner 案場業主
-- ---------------------------------------------------------------------
create table if not exists trec_direct_supply (
  year          int not null,
  seller_id     int not null,               -- T-REC 的出售單位編號
  buyer_id      int not null,
  case_id       int not null,
  seller_name   text not null,
  buyer_name    text not null,
  owner         text,
  case_name     text,
  energy        text,
  parallel_type text,                       -- 轉供／併網型直供／獨立型直供
  power_mwh     numeric not null,
  as_of         text not null,
  fetched_at    timestamptz not null default now(),
  primary key (year, seller_id, buyer_id, case_id)
);
create index if not exists trec_direct_supply_seller on trec_direct_supply (seller_name);
create index if not exists trec_direct_supply_case on trec_direct_supply (case_id);


-- ---------------------------------------------------------------------
-- 4. trec_self_use_trades：T-REC 自用發電設備憑證成交紀錄（對帳用）
--    T-REC 這份資料沒有編號，所以用流水號；每次同步整年刪掉重寫。
-- ---------------------------------------------------------------------
create table if not exists trec_self_use_trades (
  id          bigserial primary key,
  year        int not null,
  seller_name text not null,
  buyer_name  text not null,
  case_name   text,
  energy      text,
  power_mwh   numeric not null,
  traded_on   date,                         -- T-REC 的 created_at
  as_of       text not null,
  fetched_at  timestamptz not null default now()
);
create index if not exists trec_self_use_trades_year on trec_self_use_trades (year);


-- ---------------------------------------------------------------------
-- 5. trec_year_totals：每一年的驗算
--    *_published：T-REC 公布的總量｜*_sum：我們逐筆加總｜*_rows：筆數
--    等式：已發放 ＝ 直轉供 ＋ 自用 ＋ 尚未移轉（identity_diff 應該是 0）
-- ---------------------------------------------------------------------
create table if not exists trec_year_totals (
  year            int primary key,
  as_of           text not null,
  cert_published  numeric not null,
  cert_sum        numeric not null,
  cert_rows       int not null,
  remaining_sum   numeric not null,
  direct_published numeric not null,
  direct_sum      numeric not null,
  direct_rows     int not null,
  self_published  numeric not null,
  self_sum        numeric not null,
  self_rows       int not null,
  identity_diff   numeric generated always as (cert_sum - direct_sum - self_sum - remaining_sum) stored,
  checked_at      timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 6. trec_sync_runs：每次自動抓取的紀錄
-- ---------------------------------------------------------------------
create table if not exists trec_sync_runs (
  id       bigserial primary key,
  run_at   timestamptz not null default now(),
  years    int[],
  as_of    text,
  status   text not null check (status in ('running', 'ok', 'failed')),
  message  text
);


-- ---------------------------------------------------------------------
-- 7. trec_staging：自動抓取的暫存區。row 是已經整理好的一筆資料（欄位名稱和正式資料表一樣）
-- ---------------------------------------------------------------------
create table if not exists trec_staging (
  run_id  bigint not null,
  dataset text not null check (dataset in ('cert', 'direct', 'self')),
  year    int not null,
  row     jsonb not null
);
create index if not exists trec_staging_run on trec_staging (run_id, dataset, year);


-- ---------------------------------------------------------------------
-- 8. 第 2、3 階段用的表（先建好）
-- ---------------------------------------------------------------------
create table if not exists company_reports (
  id          serial primary key,
  company_id  int not null references companies (id) on delete cascade,
  report_type text not null check (report_type in ('annual', 'monthly')),
  year        int not null,
  month       int check (month between 1 and 12),   -- 年報是空值
  url         text,
  status      text not null check (status in ('found', 'page_only', 'not_found')),
  checked_on  date not null,
  note        text
);
create unique index if not exists company_reports_key on company_reports (company_id, report_type, year, coalesce(month, 0));

create table if not exists company_financials (
  id                  serial primary key,
  company_id          int not null references companies (id) on delete cascade,
  year                int not null,
  period              text not null default 'annual',
  report_id           int references company_reports (id) on delete set null,
  page                int,                     -- 數字在 PDF 第幾頁
  purchased_kwh       numeric,                 -- 售電業：購電量（度）
  sold_kwh            numeric,                 -- 售電量（度）
  operating_revenue   numeric,                 -- 營業收入（元）
  electricity_revenue numeric,                 -- 電業收入（元）
  operating_cost      numeric,                 -- 營業成本（元）
  operating_expense   numeric,                 -- 營業費用（元）
  note                text,
  unique (company_id, year, period)
);
-- 發電業要用的欄位，等第 3 階段讀完能源署的年報格式後再加。


-- ---------------------------------------------------------------------
-- 安全性：全部開 RLS、不給開放規則，網站只能透過下面的 api_ 函式讀
-- ---------------------------------------------------------------------
alter table companies            enable row level security;
alter table trec_certificates    enable row level security;
alter table trec_direct_supply   enable row level security;
alter table trec_self_use_trades enable row level security;
alter table trec_year_totals     enable row level security;
alter table trec_sync_runs       enable row level security;
alter table trec_staging         enable row level security;
alter table company_reports      enable row level security;
alter table company_financials   enable row level security;


-- ---------------------------------------------------------------------
-- 9. view company_rankings：售電業、發電業各自依「出售單位的累計直轉供移轉量」排名
--    逐年移轉量 sold_by_year：{"2020": 123.4, ...}；案場數、裝置容量、能源別都用「賣出過的案場」算
--    裝置容量：用案場編號對到已發放憑證，取最新一年的容量；對不到的案場不算進去（cap_matched 是對到的案場數）
--    同一家公司以持有人身分拿到的憑證（issued_mwh）、尚未移轉（remaining_mwh）也一起附上
-- ---------------------------------------------------------------------
create or replace view company_rankings with (security_invoker = true) as
with sold_year as (
  select seller_name, year, sum(power_mwh) as mwh
    from trec_direct_supply group by seller_name, year
), sold as (
  select seller_name, sum(mwh) as cum_mwh, min(year) as first_year,
         jsonb_object_agg(year::text, round(mwh, 3) order by year) as sold_by_year
    from sold_year group by seller_name
), cap as (
  select distinct on (case_id) case_id, capacity_kw
    from trec_certificates order by case_id, year desc
), cases as (
  select s.seller_name, count(*) as case_count, count(c.capacity_kw) as cap_matched,
         sum(c.capacity_kw) as capacity_kw
    from (select distinct seller_name, case_id from trec_direct_supply) s
    left join cap c using (case_id)
   group by s.seller_name
), energies as (
  select seller_name, array_agg(distinct energy order by energy) as energies
    from trec_direct_supply where energy is not null group by seller_name
), held as (
  select holder_name, sum(issued_mwh) as issued_mwh, sum(remaining_mwh) as remaining_mwh
    from trec_certificates group by holder_name
)
select c.id as company_id, c.role, c.name_zh, c.short_name_zh, c.name_en, c.registry_note, c.note_en,
       row_number() over (partition by c.role order by coalesce(s.cum_mwh, 0) desc, c.name_zh) as rank,
       round(coalesce(s.cum_mwh, 0), 3) as cum_mwh, s.sold_by_year, s.first_year,
       coalesce(k.case_count, 0) as case_count, k.cap_matched, k.capacity_kw, e.energies,
       round(coalesce(h.issued_mwh, 0), 3) as issued_mwh, round(coalesce(h.remaining_mwh, 0), 3) as remaining_mwh
  from companies c
  left join sold s     on s.seller_name = c.name_zh
  left join cases k    on k.seller_name = c.name_zh
  left join energies e on e.seller_name = c.name_zh
  left join held h     on h.holder_name = c.name_zh
 where c.role in ('retailer', 'generator');


-- ---------------------------------------------------------------------
-- 10. view trec_unknown_sellers：T-REC 上有、但 companies 沒有的出售單位或憑證持有人
--     用來發現可能擠進前 20 名的新業者
-- ---------------------------------------------------------------------
create or replace view trec_unknown_sellers with (security_invoker = true) as
with names as (
  select seller_name as name from trec_direct_supply
  union select holder_name from trec_certificates
)
select n.name,
       round(coalesce((select sum(power_mwh) from trec_direct_supply d where d.seller_name = n.name), 0), 3) as sold_mwh,
       round(coalesce((select sum(issued_mwh) from trec_certificates t where t.holder_name = n.name), 0), 3) as issued_mwh
  from names n
 where not exists (select 1 from companies c where c.name_zh = n.name)
 order by sold_mwh desc, issued_mwh desc;

revoke all on company_rankings, trec_unknown_sellers from anon, authenticated;


-- ---------------------------------------------------------------------
-- 11. trec_commit(run_id, as_of, totals)：把暫存區裡驗算通過的年份，一次搬進正式資料表
--     totals：[{year, cert_published, cert_sum, cert_rows, remaining_sum, direct_published, ...}, ...]
--     整個函式是一個交易：中途出錯就全部不改，舊資料不會被蓋掉一半。
--     只給自動抓取用（service_role），網站不能呼叫。
-- ---------------------------------------------------------------------
create or replace function trec_commit(p_run_id bigint, p_as_of text, p_totals jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t jsonb;
  y int;
begin
  for t in select * from jsonb_array_elements(p_totals) loop
    y := (t->>'year')::int;

    delete from trec_certificates where year = y;
    insert into trec_certificates (year, case_id, holder_name, case_name, energy, capacity_kw, issued_mwh, traded_mwh, remaining_mwh, as_of)
    select y, (r->>'case_id')::int, r->>'holder_name', r->>'case_name', r->>'energy', (r->>'capacity_kw')::numeric,
           (r->>'issued_mwh')::numeric, (r->>'traded_mwh')::numeric, (r->>'remaining_mwh')::numeric, p_as_of
      from trec_staging s, lateral (select s.row as r) x
     where s.run_id = p_run_id and s.dataset = 'cert' and s.year = y;

    delete from trec_direct_supply where year = y;
    insert into trec_direct_supply (year, seller_id, buyer_id, case_id, seller_name, buyer_name, owner, case_name, energy, parallel_type, power_mwh, as_of)
    select y, (r->>'seller_id')::int, (r->>'buyer_id')::int, (r->>'case_id')::int, r->>'seller_name', r->>'buyer_name',
           r->>'owner', r->>'case_name', r->>'energy', r->>'parallel_type', (r->>'power_mwh')::numeric, p_as_of
      from trec_staging s, lateral (select s.row as r) x
     where s.run_id = p_run_id and s.dataset = 'direct' and s.year = y;

    delete from trec_self_use_trades where year = y;
    insert into trec_self_use_trades (year, seller_name, buyer_name, case_name, energy, power_mwh, traded_on, as_of)
    select y, r->>'seller_name', r->>'buyer_name', r->>'case_name', r->>'energy', (r->>'power_mwh')::numeric,
           nullif(r->>'traded_on', '')::date, p_as_of
      from trec_staging s, lateral (select s.row as r) x
     where s.run_id = p_run_id and s.dataset = 'self' and s.year = y;

    insert into trec_year_totals (year, as_of, cert_published, cert_sum, cert_rows, remaining_sum,
                                  direct_published, direct_sum, direct_rows, self_published, self_sum, self_rows, checked_at)
    values (y, case when y = left(p_as_of, 4)::int then p_as_of else y || '-12' end,
            (t->>'cert_published')::numeric, (t->>'cert_sum')::numeric, (t->>'cert_rows')::int, (t->>'remaining_sum')::numeric,
            (t->>'direct_published')::numeric, (t->>'direct_sum')::numeric, (t->>'direct_rows')::int,
            (t->>'self_published')::numeric, (t->>'self_sum')::numeric, (t->>'self_rows')::int, now())
    on conflict (year) do update
      set as_of = excluded.as_of, cert_published = excluded.cert_published, cert_sum = excluded.cert_sum,
          cert_rows = excluded.cert_rows, remaining_sum = excluded.remaining_sum,
          direct_published = excluded.direct_published, direct_sum = excluded.direct_sum, direct_rows = excluded.direct_rows,
          self_published = excluded.self_published, self_sum = excluded.self_sum, self_rows = excluded.self_rows,
          checked_at = now();
  end loop;

  delete from trec_staging where run_id = p_run_id or run_id < p_run_id - 20;   -- 順便清掉很久以前沒清乾淨的暫存
end;
$$;

revoke execute on function trec_commit(bigint, text, jsonb) from public, anon, authenticated;
grant  execute on function trec_commit(bigint, text, jsonb) to service_role;


-- ---------------------------------------------------------------------
-- 12. api_company_rankings()：排名頁需要的全部資料
--   {"as_of": "2026-11", "years": [2020, ...], "fetched_at": ..., "retailers": [...前 20], "generators": [...前 20],
--    "year_totals": [...]}
-- ---------------------------------------------------------------------
create or replace function api_company_rankings()
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'as_of', (select as_of from trec_year_totals order by year desc limit 1),
    'years', coalesce((select jsonb_agg(year order by year) from trec_year_totals), '[]'::jsonb),
    'fetched_at', (select max(checked_at) from trec_year_totals),
    'retailers', coalesce((select jsonb_agg(to_jsonb(r) - 'role' order by r.rank)
        from company_rankings r where r.role = 'retailer' and r.rank <= 20), '[]'::jsonb),
    'generators', coalesce((select jsonb_agg(to_jsonb(r) - 'role' order by r.rank)
        from company_rankings r where r.role = 'generator' and r.rank <= 20), '[]'::jsonb),
    'year_totals', coalesce((select jsonb_agg(jsonb_build_object(
        'year', year, 'as_of', as_of, 'issued_mwh', cert_published, 'direct_mwh', direct_published,
        'self_use_mwh', self_published, 'remaining_mwh', remaining_sum) order by year)
        from trec_year_totals), '[]'::jsonb)
  );
$$;


-- ---------------------------------------------------------------------
-- 13. api_company(id)：一家業者的小檔案（找不到這家就回傳 null）
--   company：基本資料＋排名｜by_year：逐年賣出、拿到的憑證、尚未移轉
--   cases：賣出過的案場（業主、能源別、裝置容量、累計移轉量）｜reports、financials：第 2、3 階段
-- ---------------------------------------------------------------------
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
    'financials', coalesce((select jsonb_agg(to_jsonb(f) - 'company_id' order by f.year desc)
        from company_financials f where f.company_id = p_id), '[]'::jsonb)
  ) end;
$$;

revoke execute on function api_company_rankings() from public;
revoke execute on function api_company(int)       from public;
grant  execute on function api_company_rankings() to anon, authenticated, service_role;
grant  execute on function api_company(int)       to anon, authenticated, service_role;


-- 檢查：應該是 42 家業者（售電業 20、發電業 20、台電 1、排除 1）
select role as 分類, count(*) as 家數 from companies group by role order by role;
