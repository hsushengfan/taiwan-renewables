-- =====================================================================
-- 網站需要的後端：能源分類、英文名稱、類型彙總、給網站讀資料的函式
--
-- 使用方式：整份複製，貼到 SQL Editor（下拉選單選 Database），按 Run。
-- 重複執行沒關係。要先執行過 001 ~ 004。
--
-- 設計說明見 docs/database.md 和 docs/website-v1.md。
-- =====================================================================


-- ---------------------------------------------------------------------
-- categories：網站用的 11 個能源分類
--   台電原本的「機組類型」不夠用：沒有區分陸域和離岸風電，
--   所以我們自己訂一套分類，每個機組對應到其中一類。
--   sort_order 是堆疊圖由下到上的順序。
-- ---------------------------------------------------------------------
create table if not exists categories (
  id           smallint primary key,
  code         text not null unique,     -- 程式用的代號，例如 'wind_offshore'
  name_zh      text not null,
  name_en      text not null,
  is_renewable boolean not null,
  sort_order   smallint not null
);

insert into categories (id, code, name_zh, name_en, is_renewable, sort_order) values
  (1,  'coal',            '燃煤',         'Coal',             false, 1),
  (2,  'ipp_coal',        '民營燃煤',     'IPP Coal',         false, 2),
  (3,  'gas',             '燃氣',         'Gas',              false, 3),
  (4,  'ipp_gas',         '民營燃氣',     'IPP Gas',          false, 4),
  (5,  'other_thermal',   '其它火力',     'Other Thermal',    false, 5),
  (6,  'storage',         '儲能',         'Storage',          false, 6),
  (7,  'hydro',           '水力',         'Hydro',            true,  7),
  (8,  'other_renewable', '其它再生能源', 'Other Renewables', true,  8),
  (9,  'solar',           '太陽能',       'Solar',            true,  9),
  (10, 'wind_onshore',    '陸域風電',     'Onshore Wind',     true,  10),
  (11, 'wind_offshore',   '離岸風電',     'Offshore Wind',    true,  11)
on conflict (id) do update
  set code = excluded.code, name_zh = excluded.name_zh, name_en = excluded.name_en,
      is_renewable = excluded.is_renewable, sort_order = excluded.sort_order;

alter table categories enable row level security;


-- ---------------------------------------------------------------------
-- units：加上「分類」和「英文名稱」
-- ---------------------------------------------------------------------
alter table units add column if not exists category_id smallint references categories (id);
alter table units add column if not exists name_en text;

-- 台電的機組類型 → 預設的分類。
-- 風力預設是「陸域」；離岸風場要另外標記（見下面的名單）。
create or replace function default_category_id(p_type text)
returns smallint
language sql immutable
as $$
  select (case p_type
    when '燃煤'          then 1
    when '民營電廠-燃煤' then 2
    when '燃氣'          then 3
    when '民營電廠-燃氣' then 4
    when '燃料油'        then 5
    when '汽電共生'      then 5
    when '儲能'          then 6
    when '水力'          then 7
    when '其它再生能源'  then 8
    when '太陽能'        then 9
    when '風力'          then 10
  end)::smallint;
$$;

-- 台電出現新機組時，自動給它預設的分類
create or replace function units_set_category()
returns trigger
language plpgsql
as $$
begin
  if new.category_id is null then
    new.category_id := default_category_id(new.type);
  end if;
  return new;
end;
$$;

drop trigger if exists units_set_category on units;
create trigger units_set_category
  before insert on units
  for each row execute function units_set_category();

-- 現有的機組：還沒有分類的，填上預設分類
update units set category_id = default_category_id(type) where category_id is null;

-- 離岸風場名單（其餘的風力機組都是陸域）。
-- 台電之後新增離岸風場時，要在這裡加上名稱再執行一次，或手動改 category_id。
update units set category_id = 11
 where type = '風力'
   and name in ('離岸一期', '離岸二期', '海洋竹南', '海能風', '沃一風', '沃二風', '沃四風', '沃南風',
                '芳一風', '芳二風', '允湖', '允西', '中能風', '龍A風', '龍B風', '龍三風');


-- 機組的英文名稱（草稿：電廠名稱用常見的拼音，離岸風場用開發商的英文案名）
update units u set name_en = v.name_en
  from (values
  ('儲能', '大觀二#1', 'Takuan 2 #1'),
  ('儲能', '大觀二#2', 'Takuan 2 #2'),
  ('儲能', '大觀二#3', 'Takuan 2 #3'),
  ('儲能', '大觀二#4', 'Takuan 2 #4'),
  ('儲能', '明潭#1', 'Mingtan #1'),
  ('儲能', '明潭#2', 'Mingtan #2'),
  ('儲能', '明潭#3', 'Mingtan #3'),
  ('儲能', '明潭#4', 'Mingtan #4'),
  ('儲能', '明潭#5', 'Mingtan #5'),
  ('儲能', '明潭#6', 'Mingtan #6'),
  ('儲能', '電池', 'Battery Storage'),
  ('其它再生能源', '台電自有地熱', 'Taipower Geothermal'),
  ('其它再生能源', '生質能(Biofuel)', 'Biomass'),
  ('其它再生能源', '購電地熱', 'Purchased Geothermal'),
  ('太陽能', '其它台電自有', 'Other Taipower-owned Solar'),
  ('太陽能', '其它購電太陽能', 'Other Purchased Solar'),
  ('太陽能', '南鹽光', 'Nanyan Solar'),
  ('太陽能', '向陽光', 'Xiangyang Solar'),
  ('太陽能', '天篷光', 'Tianpeng Solar'),
  ('太陽能', '天英光', 'Tianying Solar'),
  ('太陽能', '天衝光', 'Tianchong Solar'),
  ('太陽能', '寶興光', 'Baoxing Solar'),
  ('太陽能', '崙尾光', 'Lunwei Solar'),
  ('太陽能', '廷和光', 'Tinghe Solar'),
  ('太陽能', '彰濱光', 'Changbin Solar'),
  ('太陽能', '志光光', 'Zhiguang Solar'),
  ('太陽能', '新和光', 'Xinhe Solar'),
  ('太陽能', '星崙光', 'Xinglun Solar'),
  ('太陽能', '星崴光', 'Xingwei Solar'),
  ('太陽能', '星股光', 'Xinggu Solar'),
  ('太陽能', '昱昶光', 'Yuchang Solar'),
  ('太陽能', '永堯光', 'Yongyao Solar'),
  ('太陽能', '生利光', 'Shengli Solar'),
  ('太陽能', '碩力光', 'Shuoli Solar'),
  ('太陽能', '聯華光', 'Lianhua Solar'),
  ('民營電廠-燃氣', '嘉惠#1', 'Chiahui #1'),
  ('民營電廠-燃氣', '嘉惠#2', 'Chiahui #2'),
  ('民營電廠-燃氣', '國光#1', 'Kuokuang #1'),
  ('民營電廠-燃氣', '新桃#1', 'Hsintao #1'),
  ('民營電廠-燃氣', '星元#1', 'Hsingyuan #1'),
  ('民營電廠-燃氣', '星彰#1', 'Hsingchang #1'),
  ('民營電廠-燃氣', '海湖#1', 'Haihu #1'),
  ('民營電廠-燃氣', '海湖#2', 'Haihu #2'),
  ('民營電廠-燃氣', '豐德#1', 'Fengte #1'),
  ('民營電廠-燃氣', '豐德#2', 'Fengte #2'),
  ('民營電廠-燃氣', '豐德#3', 'Fengte #3'),
  ('民營電廠-燃煤', '和平#1', 'Hoping #1'),
  ('民營電廠-燃煤', '和平#2', 'Hoping #2'),
  ('水力', '中部小水力', 'Central Small Hydro'),
  ('水力', '其它購電小水力', 'Other Purchased Small Hydro'),
  ('水力', '北部小水力', 'Northern Small Hydro'),
  ('水力', '卑南', 'Peinan'),
  ('水力', '卓蘭#1', 'Cholan #1'),
  ('水力', '卓蘭#2', 'Cholan #2'),
  ('水力', '南部小水力', 'Southern Small Hydro'),
  ('水力', '名間', 'Mingchien'),
  ('水力', '嘉南西口、烏山頭和八田', 'Chianan Hsikou, Wushantou & Hatta'),
  ('水力', '大觀一#1', 'Takuan 1 #1'),
  ('水力', '大觀一#2', 'Takuan 1 #2'),
  ('水力', '大觀一#3', 'Takuan 1 #3'),
  ('水力', '大觀一#4', 'Takuan 1 #4'),
  ('水力', '大觀一#5', 'Takuan 1 #5'),
  ('水力', '天輪#1', 'Tienlun #1'),
  ('水力', '天輪#2', 'Tienlun #2'),
  ('水力', '天輪#3', 'Tienlun #3'),
  ('水力', '天輪#4', 'Tienlun #4'),
  ('水力', '天輪#5', 'Tienlun #5'),
  ('水力', '德基#1', 'Techi #1'),
  ('水力', '德基#2', 'Techi #2'),
  ('水力', '德基#3', 'Techi #3'),
  ('水力', '捷祥關山', 'Chiehhsiang Kuanshan'),
  ('水力', '曾文#1', 'Tsengwen #1'),
  ('水力', '東部小水力', 'Eastern Small Hydro'),
  ('水力', '松林#1&2', 'Sunglin #1&2'),
  ('水力', '水里#1', 'Shuili #1'),
  ('水力', '烏來&桂山&粗坑', 'Wulai & Kueishan & Tsukeng'),
  ('水力', '石門#1', 'Shihmen #1'),
  ('水力', '石門#2', 'Shihmen #2'),
  ('水力', '碧海', 'Pihai'),
  ('水力', '萬大#1', 'Wanta #1'),
  ('水力', '萬大#2', 'Wanta #2'),
  ('水力', '萬大#3', 'Wanta #3'),
  ('水力', '萬大#4', 'Wanta #4'),
  ('水力', '立霧#1&#2', 'Liwu #1&#2'),
  ('水力', '義興#1', 'Yihsing #1'),
  ('水力', '翡翠#1', 'Feitsui #1'),
  ('水力', '谷關#1', 'Kukuan #1'),
  ('水力', '谷關#2', 'Kukuan #2'),
  ('水力', '谷關#3', 'Kukuan #3'),
  ('水力', '谷關#4', 'Kukuan #4'),
  ('水力', '鉅工#1', 'Chukung #1'),
  ('水力', '鉅工#2', 'Chukung #2'),
  ('水力', '青山#1', 'Chingshan #1'),
  ('水力', '青山#2', 'Chingshan #2'),
  ('水力', '青山#3', 'Chingshan #3'),
  ('水力', '青山#4', 'Chingshan #4'),
  ('水力', '馬鞍#1', 'Maan #1'),
  ('水力', '馬鞍#2', 'Maan #2'),
  ('水力', '龍澗#1', 'Lungchien #1'),
  ('水力', '龍澗#2', 'Lungchien #2'),
  ('汽電共生', '汽電共生', 'Cogeneration'),
  ('燃料油', '協和#3', 'Hsiehho #3'),
  ('燃料油', '協和#4', 'Hsiehho #4'),
  ('燃料油', '台中Gas1&2', 'Taichung Gas Turbine 1&2'),
  ('燃料油', '台中Gas3&4', 'Taichung Gas Turbine 3&4'),
  ('燃料油', '核三Gas1', 'Maanshan Gas Turbine 1'),
  ('燃料油', '核三Gas2', 'Maanshan Gas Turbine 2'),
  ('燃料油', '核二Gas1', 'Kuosheng Gas Turbine 1'),
  ('燃料油', '核二Gas2', 'Kuosheng Gas Turbine 2'),
  ('燃料油', '澎湖尖山', 'Penghu Chienshan'),
  ('燃料油', '金門塔山', 'Kinmen Tashan'),
  ('燃料油', '離島其它', 'Other Outlying Islands'),
  ('燃料油', '馬祖珠山', 'Matsu Chushan'),
  ('燃氣', '南部CC#1', 'Nanpu CC #1'),
  ('燃氣', '南部CC#2', 'Nanpu CC #2'),
  ('燃氣', '南部CC#3', 'Nanpu CC #3'),
  ('燃氣', '南部CC#4', 'Nanpu CC #4'),
  ('燃氣', '台中CC#1', 'Taichung CC #1'),
  ('燃氣', '台中CC#2', 'Taichung CC #2'),
  ('燃氣', '大林#5', 'Talin #5'),
  ('燃氣', '大林#6', 'Talin #6'),
  ('燃氣', '大潭CC#1', 'Datan CC #1'),
  ('燃氣', '大潭CC#2', 'Datan CC #2'),
  ('燃氣', '大潭CC#3', 'Datan CC #3'),
  ('燃氣', '大潭CC#4', 'Datan CC #4'),
  ('燃氣', '大潭CC#5', 'Datan CC #5'),
  ('燃氣', '大潭CC#6', 'Datan CC #6'),
  ('燃氣', '大潭CC#7', 'Datan CC #7'),
  ('燃氣', '大潭CC#8', 'Datan CC #8'),
  ('燃氣', '大潭CC#9', 'Datan CC #9'),
  ('燃氣', '興達CC#1', 'Hsinta CC #1'),
  ('燃氣', '興達CC#2', 'Hsinta CC #2'),
  ('燃氣', '興達CC#3', 'Hsinta CC #3'),
  ('燃氣', '興達CC#4', 'Hsinta CC #4'),
  ('燃氣', '興達CC#5', 'Hsinta CC #5'),
  ('燃氣', '興達新CC#1', 'Hsinta New CC #1'),
  ('燃氣', '興達新CC#2', 'Hsinta New CC #2'),
  ('燃氣', '興達新CC#3', 'Hsinta New CC #3'),
  ('燃氣', '通霄CC#1', 'Tongxiao CC #1'),
  ('燃氣', '通霄CC#2', 'Tongxiao CC #2'),
  ('燃氣', '通霄CC#3', 'Tongxiao CC #3'),
  ('燃氣', '通霄CC#6', 'Tongxiao CC #6'),
  ('燃氣', '通霄GT#9', 'Tongxiao GT #9'),
  ('燃煤', '台中#10', 'Taichung #10'),
  ('燃煤', '台中#3', 'Taichung #3'),
  ('燃煤', '台中#4', 'Taichung #4'),
  ('燃煤', '台中#5', 'Taichung #5'),
  ('燃煤', '台中#6', 'Taichung #6'),
  ('燃煤', '台中#7', 'Taichung #7'),
  ('燃煤', '台中#8', 'Taichung #8'),
  ('燃煤', '台中#9', 'Taichung #9'),
  ('燃煤', '大林#1', 'Talin #1'),
  ('燃煤', '大林#2', 'Talin #2'),
  ('燃煤', '林口#1', 'Linkou #1'),
  ('燃煤', '林口#2', 'Linkou #2'),
  ('燃煤', '林口#3', 'Linkou #3'),
  ('燃煤', '興達#1', 'Hsinta #1'),
  ('燃煤', '興達#2', 'Hsinta #2'),
  ('燃煤', '興達#3', 'Hsinta #3'),
  ('燃煤', '興達#4', 'Hsinta #4'),
  ('風力', '中威大安', 'Zhongwei Da''an'),
  ('風力', '中能風', 'Zhong Neng'),
  ('風力', '允湖', 'Yunlin (Yunhu)'),
  ('風力', '允西', 'Yunlin (Yunxi)'),
  ('風力', '其它台電自有', 'Other Taipower-owned Wind'),
  ('風力', '其它購電風力', 'Other Purchased Wind'),
  ('風力', '創維風', 'Chuangwei'),
  ('風力', '台中港', 'Taichung Harbor'),
  ('風力', '四湖', 'Sihu'),
  ('風力', '彰品風', 'Zhangpin'),
  ('風力', '彰工', 'Changgong'),
  ('風力', '新源崙背', 'Xinyuan Lunbei'),
  ('風力', '沃一風', 'Greater Changhua 1'),
  ('風力', '沃二風', 'Greater Changhua 2a'),
  ('風力', '沃南風', 'Greater Changhua 2b'),
  ('風力', '沃四風', 'Greater Changhua 4'),
  ('風力', '海洋竹南', 'Formosa 1'),
  ('風力', '海能風', 'Formosa 2'),
  ('風力', '王功', 'Wanggong'),
  ('風力', '芳一風', 'Changfang Phase 1'),
  ('風力', '芳二風', 'Changfang Phase 2'),
  ('風力', '苗栗大鵬', 'Miaoli Dapeng'),
  ('風力', '觀園', 'Guanyuan'),
  ('風力', '觀威觀音&桃威新屋', 'Guanwei Guanyin & Taowei Xinwu'),
  ('風力', '離岸一期', 'Taipower Offshore Phase 1'),
  ('風力', '離岸二期', 'Taipower Offshore Phase 2'),
  ('風力', '雲麥', 'Yunmai'),
  ('風力', '鹿威彰濱', 'Luwei Changbin'),
  ('風力', '龍A風', 'Hai Long 2A'),
  ('風力', '龍B風', 'Hai Long 2B'),
  ('風力', '龍三風', 'Hai Long 3')
  ) as v(type, name, name_en)
 where u.type = v.type and u.name = v.name;


-- ---------------------------------------------------------------------
-- 狀態和備註的英文
-- ---------------------------------------------------------------------
alter table statuses     add column if not exists name_en   text;
alter table remark_rules add column if not exists remark_en text;

update statuses s set name_en = v.name_en
  from (values (1, 'Normal'), (2, 'Voluntary curtailment'), (3, 'Partial outage'), (4, 'Outage'),
               (5, 'Unknown'), (6, 'Commissioning'), (7, 'Unclassified')) as v(id, name_en)
 where s.id = v.id;

update remark_rules r set remark_en = v.remark_en
  from (values
    ('配合綠電先行',     'Green power priority'),
    ('友善降載減排',     'Derated to reduce emissions'),
    ('部分檢修',         'Partial maintenance'),
    ('部分歲修',         'Partial annual overhaul'),
    ('部分故障',         'Partial fault'),
    ('運轉限制',         'Operating limit'),
    ('環保限制',         'Environmental limit'),
    ('檢修',             'Maintenance'),
    ('歲修',             'Annual overhaul'),
    ('故障',             'Fault'),
    ('通訊異常',         'Communication error'),
    ('新機組試俥',       'New unit trial run'),
    ('新增設備測試運轉', 'New equipment test run'),
    ('測試運轉',         'Test run')
  ) as v(remark, remark_en)
 where r.remark = v.remark;


-- ---------------------------------------------------------------------
-- category_readings：每 10 分鐘、每個分類的彙總（給首頁的堆疊圖用）
--   完全由 readings 算出來，可以隨時重算。
--   為什麼要另外存一張表？首頁每次都要「11 類 × 幾百個時間點」的數字，
--   每次都從 191 個機組現算太慢，先算好存起來，網站讀起來才快。
-- ---------------------------------------------------------------------
create table if not exists category_readings (
  observed_at     timestamptz not null,
  category_id     smallint not null references categories (id),
  output_mw       real not null,     -- 這一類全部機組的淨發電量加總 (MW)
  capacity_mw     real,              -- 這一類有裝置容量的機組，容量加總 (MW)
  capacity_factor real,              -- 這一類的容量因數 (0~1)：只算「能算容量因數」的機組
  unit_count      smallint not null, -- 這一類有幾個機組
  primary key (observed_at, category_id)
);

alter table category_readings enable row level security;

-- 重算某一段時間的 category_readings。
-- 改了機組的分類之後，要執行一次：select refresh_category_readings();
create or replace function refresh_category_readings(
  p_from timestamptz default '-infinity',
  p_to   timestamptz default 'infinity')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from category_readings where observed_at >= p_from and observed_at <= p_to;

  insert into category_readings (observed_at, category_id, output_mw, capacity_mw, capacity_factor, unit_count)
  select e.observed_at,
         u.category_id,
         sum(coalesce(e.output_mw, 0)),
         sum(e.capacity_mw),
         sum(e.capacity_factor * e.capacity_mw) filter (where e.capacity_factor is not null)
           / nullif(sum(e.capacity_mw) filter (where e.capacity_factor is not null), 0),
         count(*)
    from readings_evaluated e
    join units u on u.id = e.unit_id
   where e.observed_at >= p_from and e.observed_at <= p_to
     and u.category_id is not null
   group by e.observed_at, u.category_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- readings 每次有新資料進來，自動更新那個時間點的 category_readings
create or replace function readings_refresh_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from timestamptz;
  v_to   timestamptz;
begin
  select min(observed_at), max(observed_at) into v_from, v_to from new_rows;
  if v_from is not null then
    perform refresh_category_readings(v_from, v_to);
  end if;
  return null;
end;
$$;

drop trigger if exists readings_refresh_categories on readings;
create trigger readings_refresh_categories
  after insert on readings
  referencing new table as new_rows
  for each statement execute function readings_refresh_categories();

-- 把目前已有的資料全部算一次
select refresh_category_readings();


-- =====================================================================
-- 給網站讀資料的函式（api_ 開頭）
--
-- 資料表全部鎖著（RLS），網站只能透過這幾個函式讀資料。
-- 好處：只開放網站需要的內容；每個函式都限制了時間範圍，不會被拿來一次撈走全部資料。
-- 「security definer」的意思是：函式用「資料庫擁有者」的權限去讀資料表，
-- 所以訪客即使沒有讀資料表的權限，也能透過函式拿到結果。
-- =====================================================================

-- api_meta()：網站一打開就需要的基本資料
--   分類、狀態、備註的中英文，全部機組的清單和「最新一筆」的數字
create or replace function api_meta()
returns jsonb
language sql stable
security definer
set search_path = public
set timezone = 'Asia/Taipei'
as $$
  with latest as (select max(observed_at) as t from category_readings)
  select jsonb_build_object(
    'latest',   (select t from latest),
    'earliest', (select min(observed_at) from category_readings),
    'categories', (select jsonb_agg(jsonb_build_object(
                     'id', id, 'code', code, 'name_zh', name_zh, 'name_en', name_en,
                     'is_renewable', is_renewable) order by sort_order) from categories),
    'statuses', (select jsonb_agg(jsonb_build_object(
                     'id', id, 'name_zh', name, 'name_en', name_en, 'flagged', flagged) order by id) from statuses),
    'remarks',  (select coalesce(jsonb_object_agg(remark, remark_en), '{}'::jsonb)
                   from remark_rules where remark <> '' and remark_en is not null),
    'units',    (select jsonb_agg(jsonb_build_object(
                     'id', u.id, 'type', u.type, 'name_zh', u.name, 'name_en', u.name_en,
                     'category_id', u.category_id,
                     'capacity_mw', r.capacity_mw, 'output_mw', r.output_mw,
                     'status_id', r.status_id, 'remark', r.remark) order by u.id)
                   from units u
                   left join readings r on r.unit_id = u.id and r.observed_at = (select t from latest))
  );
$$;


-- api_category_series(開始, 結束, 粒度)：各分類的發電量和容量因數的時間序列
--   粒度：'10min'（最多 8 天）、'hour'（最多 100 天）、'day'（最多 5 年）
--   回傳 {"times": [...], "series": {"分類編號": {"output": [...], "cf": [...]}}}
create or replace function api_category_series(
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket text default '10min')
returns jsonb
language plpgsql stable
security definer
set search_path = public
set timezone = 'Asia/Taipei'
as $$
declare
  v_max interval := case p_bucket when '10min' then interval '8 days'
                                  when 'hour'  then interval '100 days'
                                  when 'day'   then interval '5 years' end;
  v_result jsonb;
begin
  if v_max is null then
    raise exception 'p_bucket 必須是 10min、hour 或 day';
  end if;
  if p_to - p_from > v_max then
    raise exception '時間範圍太長：% 最多 %', p_bucket, v_max;
  end if;

  with b as (
    select case p_bucket when '10min' then observed_at
                         when 'hour'  then date_trunc('hour', observed_at)
                         else              date_trunc('day',  observed_at) end as t,
           category_id,
           avg(output_mw)       as output_mw,
           avg(capacity_factor) as capacity_factor
      from category_readings
     where observed_at >= p_from and observed_at < p_to
     group by 1, 2
  ),
  t as (select distinct t from b)
  select jsonb_build_object(
    'bucket', p_bucket,
    'times',  coalesce((select jsonb_agg(t order by t) from t), '[]'::jsonb),
    'series', coalesce((
      select jsonb_object_agg(category_id, s) from (
        select c.id as category_id,
               jsonb_build_object(
                 'output', jsonb_agg(round(b.output_mw::numeric, 1) order by t.t),
                 'cf',     jsonb_agg(round(b.capacity_factor::numeric, 4) order by t.t)) as s
          from categories c
         cross join t
          left join b on b.t = t.t and b.category_id = c.id
         group by c.id) x), '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;


-- api_unit_series(開始, 結束, 分類, 機組)：機組每 10 分鐘的發電量和狀態（最多 8 天）
--   「分類」和「機組」至少要給一個。
--   回傳 {"times": [...], "units": {"機組編號": {"output": [...], "status": [...]}}}
create or replace function api_unit_series(
  p_from        timestamptz,
  p_to          timestamptz,
  p_category_id smallint default null,
  p_unit_id     smallint default null)
returns jsonb
language plpgsql stable
security definer
set search_path = public
set timezone = 'Asia/Taipei'
as $$
declare
  v_result jsonb;
begin
  if p_category_id is null and p_unit_id is null then
    raise exception 'p_category_id 和 p_unit_id 至少要給一個';
  end if;
  if p_to - p_from > interval '8 days' then
    raise exception '時間範圍太長：最多 8 天';
  end if;

  with t as (
    select distinct observed_at as t from category_readings
     where observed_at >= p_from and observed_at < p_to
  ),
  picked as (
    select id from units
     where (p_category_id is null or category_id = p_category_id)
       and (p_unit_id is null or id = p_unit_id)
  )
  select jsonb_build_object(
    'times', coalesce((select jsonb_agg(t order by t) from t), '[]'::jsonb),
    'units', coalesce((
      select jsonb_object_agg(unit_id, s) from (
        select p.id as unit_id,
               jsonb_build_object(
                 'output', jsonb_agg(r.output_mw order by t.t),
                 'status', jsonb_agg(coalesce(r.status_id, 0) order by t.t)) as s
          from picked p
         cross join t
          left join readings r on r.unit_id = p.id and r.observed_at = t.t
         group by p.id) x), '{}'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;


-- api_daily(開始日, 結束日, 分類, 機組)：每日彙總
--   沒有指定機組時最多 62 天；指定單一機組時最多 5 年。
--   回傳一個陣列，每個元素是某機組某一天的數字。
create or replace function api_daily(
  p_from        date,
  p_to          date,
  p_category_id smallint default null,
  p_unit_id     smallint default null)
returns jsonb
language plpgsql stable
security definer
set search_path = public
set timezone = 'Asia/Taipei'
as $$
begin
  if p_to - p_from > (case when p_unit_id is null then 62 else 1830 end) then
    raise exception '日期範圍太長';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'day', d.day, 'unit_id', d.unit_id,
             'generation_kwh', round(d.generation_kwh::numeric),
             'capacity_factor', round(d.capacity_factor::numeric, 4),
             'capacity_mw', d.capacity_mw,
             'intervals_present', d.intervals_present,
             'flagged_remarks', d.flagged_remarks) order by d.day, d.unit_id)
      from daily_unit_stats d
      join units u on u.id = d.unit_id
     where d.day >= p_from and d.day <= p_to
       and (p_category_id is null or u.category_id = p_category_id)
       and (p_unit_id is null or d.unit_id = p_unit_id)), '[]'::jsonb);
end;
$$;


-- 權限：api_ 函式開放給訪客（anon）；重算用的函式只給收集程式
revoke execute on function refresh_category_readings(timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function refresh_category_readings(timestamptz, timestamptz) to service_role;

revoke execute on function api_meta()                                                  from public;
revoke execute on function api_category_series(timestamptz, timestamptz, text)         from public;
revoke execute on function api_unit_series(timestamptz, timestamptz, smallint, smallint) from public;
revoke execute on function api_daily(date, date, smallint, smallint)                   from public;
grant  execute on function api_meta()                                                  to anon, authenticated, service_role;
grant  execute on function api_category_series(timestamptz, timestamptz, text)         to anon, authenticated, service_role;
grant  execute on function api_unit_series(timestamptz, timestamptz, smallint, smallint) to anon, authenticated, service_role;
grant  execute on function api_daily(date, date, smallint, smallint)                   to anon, authenticated, service_role;
