-- =====================================================================
-- 步驟 2：建立資料表
--
-- 使用方式：整份複製，貼到 Supabase 網站的 SQL Editor，按 Run。
-- 重複執行也沒關係（每個指令都有「已經存在就跳過」的寫法）。
--
-- 設計理由請看 docs/supabase-plan.md。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 時區：讓資料庫預設用台灣時間顯示
-- （資料本身是記錄「絕對時間點」，這裡只影響顯示和「每天」怎麼切）
-- 注意：要重新整理 SQL Editor 頁面後才會生效。
-- ---------------------------------------------------------------------
alter database postgres set timezone to 'Asia/Taipei';


-- ---------------------------------------------------------------------
-- statuses：狀態代碼（和 availability.py 的分類一樣）
--   availability_rule 說明這個狀態的 availability 怎麼算：
--     full   = 一律 100%
--     output = 實際發電量 ÷ 裝置容量
--     skip   = 這個時間點不算
--   flagged = 網站上要特別標註（檢修、故障等）
-- ---------------------------------------------------------------------
create table if not exists statuses (
  id                smallint primary key,
  name              text not null unique,
  availability_rule text not null check (availability_rule in ('full', 'output', 'skip')),
  flagged           boolean not null default false
);

insert into statuses (id, name, availability_rule, flagged) values
  (1, '正常',     'full',   false),
  (2, '主動少發', 'full',   false),
  (3, '部分停機', 'output', true),
  (4, '停機',     'output', true),
  (5, '狀態不明', 'skip',   false),
  (6, '試運轉',   'skip',   false),
  (7, '未知備註', 'output', true)   -- 規則表裡沒有的備註，保守當作發不出來
on conflict (id) do update
  set name = excluded.name,
      availability_rule = excluded.availability_rule,
      flagged = excluded.flagged;


-- ---------------------------------------------------------------------
-- remark_rules：備註 → 狀態代碼
-- 必須和 availability.py 的 REMARK_RULES 完全一致
-- （tests/test_rules_match.py 會自動檢查）。
--
-- 之後出現新備註，只要在這張表加一列，舊資料會自動重新分類
-- （見下面的 remark_rules_changed 觸發器）。
-- ---------------------------------------------------------------------
create table if not exists remark_rules (
  remark    text primary key,
  status_id smallint not null references statuses (id)
);

insert into remark_rules (remark, status_id) values
  ('',                 1),  -- 正常
  ('配合綠電先行',     2),  -- 主動少發
  ('友善降載減排',     2),
  ('部分檢修',         3),  -- 部分停機
  ('部分歲修',         3),
  ('部分故障',         3),
  ('運轉限制',         3),
  ('環保限制',         3),
  ('檢修',             4),  -- 停機
  ('歲修',             4),
  ('故障',             4),
  ('通訊異常',         5),  -- 狀態不明
  ('新機組試俥',       6),  -- 試運轉
  ('新增設備測試運轉', 6),
  ('測試運轉',         6)
on conflict (remark) do update set status_id = excluded.status_id;


-- ---------------------------------------------------------------------
-- units：機組清單
--   id 是固定編號，一旦給了就不會變。
--   「類型 + 名稱」不能重複（和 clean_data.py 的 unit_id 一樣）。
-- ---------------------------------------------------------------------
create table if not exists units (
  id            smallint generated always as identity primary key,
  type          text not null,
  name          text not null,
  is_renewable  boolean not null,
  footnote      text not null default '',   -- 最近一次看到的註記編號，例如 '10'
  first_seen_at timestamptz not null,
  last_seen_at  timestamptz not null,
  unique (type, name)
);


-- ---------------------------------------------------------------------
-- readings：每 10 分鐘的發電紀錄（最大的一張表）
--   主鍵 (observed_at, unit_id)：同一時間點同一機組只會有一筆。
--   status_id 不用自己填，資料庫會依照 remark 自動填。
-- ---------------------------------------------------------------------
create table if not exists readings (
  observed_at timestamptz not null,
  unit_id     smallint not null references units (id),
  capacity_mw real,                   -- 台電寫「-」→ 空值
  output_mw   real,                   -- 台電寫「N/A」→ 空值
  status_id   smallint not null references statuses (id),
  remark      text not null default '',
  primary key (observed_at, unit_id)
);

-- 查「某個機組的歷史」用的索引
create index if not exists readings_unit_time_idx on readings (unit_id, observed_at);


-- 寫入時自動依備註填 status_id；規則表裡沒有的備註 → 7（未知備註）
create or replace function classify_remark(p_remark text)
returns smallint
language sql stable
as $$
  select coalesce((select status_id from remark_rules where remark = p_remark), 7::smallint);
$$;

create or replace function readings_set_status()
returns trigger
language plpgsql
as $$
begin
  new.status_id := classify_remark(new.remark);
  return new;
end;
$$;

drop trigger if exists readings_set_status on readings;
create trigger readings_set_status
  before insert or update of remark on readings
  for each row execute function readings_set_status();


-- 規則表改了（新增、修改、刪除）→ 把有這個備註的舊資料重新分類
create or replace function remark_rules_changed()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update readings set status_id = classify_remark(remark)
     where remark = old.remark;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update readings set status_id = classify_remark(remark)
     where remark = new.remark;
  end if;
  return null;
end;
$$;

drop trigger if exists remark_rules_changed on remark_rules;
create trigger remark_rules_changed
  after insert or update or delete on remark_rules
  for each row execute function remark_rules_changed();


-- ---------------------------------------------------------------------
-- collection_runs：每次收集的紀錄，出問題時查這張
-- ---------------------------------------------------------------------
create table if not exists collection_runs (
  id            bigint generated always as identity primary key,
  run_at        timestamptz not null default now(),
  source        text not null,            -- 'supabase'、'github'、'import'
  ok            boolean not null,
  data_time     timestamptz,              -- 抓到的台電資料時間
  units_seen    int,                      -- 這次資料有幾個機組
  rows_inserted int,                      -- 實際新增幾列（0 = 這個時間點之前已經存過）
  message       text
);

create index if not exists collection_runs_run_at_idx on collection_runs (run_at);


-- ---------------------------------------------------------------------
-- 把「台電給的數字字串」轉成數字，和 clean_data.py 的 parse_number 一樣：
--   "742.7" → 742.7；"1,234" → 1234；"84.9%" → 84.9
--   ""、"-"、"N/A"、"NA" 或看不懂的值 → 空值
-- ---------------------------------------------------------------------
create or replace function parse_taipower_number(p_text text)
returns real
language plpgsql immutable
as $$
declare
  t text := rtrim(replace(btrim(coalesce(p_text, '')), ',', ''), '%');
begin
  if t in ('', '-', 'N/A', 'NA') then
    return null;
  end if;
  return t::real;
exception when others then
  return null;
end;
$$;


-- ---------------------------------------------------------------------
-- ingest_snapshot：把一份「台電原始 JSON」整理後存進資料庫
--
-- Edge Function、GitHub Actions 備援、匯入舊資料，全部都呼叫這個函式，
-- 所以「怎麼整理資料」只寫在這一個地方。整理規則和 clean_data.py 一樣：
--   - 去掉「小計」列和「儲能負載」列
--   - 類型去掉網頁標籤，例如 "</b>"
--   - 名稱的「(註10)」拆出來另外存
--   - 備註去掉前後空白（" " 變成 ""）
--   - 台電的 DateTime 當作台灣時間
--
-- 回傳：{"data_time": ..., "units_seen": 191, "rows_inserted": 191}
-- 已經存過的時間點，rows_inserted 會是 0（不會重複存）。
-- ---------------------------------------------------------------------
create or replace function ingest_snapshot(raw jsonb, source text default 'supabase')
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_time       timestamptz;
  v_units_seen int;
  v_inserted   int;
begin
  if raw ->> 'DateTime' is null or jsonb_typeof(raw -> 'aaData') is distinct from 'array' then
    raise exception '資料格式不對：沒有 DateTime 或 aaData';
  end if;

  v_time := (raw ->> 'DateTime')::timestamp at time zone 'Asia/Taipei';

  create temporary table if not exists _snapshot (
    type text, name text, footnote text,
    capacity_mw real, output_mw real, remark text
  ) on commit drop;
  truncate _snapshot;

  insert into _snapshot
  select t.type, n.name, n.footnote,
         parse_taipower_number(item ->> '裝置容量(MW)'),
         parse_taipower_number(item ->> '淨發電量(MW)'),
         regexp_replace(coalesce(item ->> '備註', ''), '^\s+|\s+$', '', 'g')
    from jsonb_array_elements(raw -> 'aaData') as item
   cross join lateral (
     select btrim(regexp_replace(item ->> '機組類型', '<[^>]+>', '', 'g')) as type
   ) t
   cross join lateral (
     select btrim(regexp_replace(item ->> '機組名稱', '[(（]\s*註\s*(\d+)\s*[)）]', '', 'g')) as name,
            coalesce((select string_agg(m[1], ',')
                        from regexp_matches(item ->> '機組名稱', '[(（]\s*註\s*(\d+)\s*[)）]', 'g') as m),
                     '') as footnote
   ) n
   where n.name not like '小計%'
     and t.type not like '儲能負載%';

  select count(*) into v_units_seen from _snapshot;
  if v_units_seen = 0 then
    raise exception '資料裡沒有任何機組';
  end if;

  -- 新機組自動加進 units。
  -- 只對「真的沒看過」的機組做 insert：如果每次都對全部機組 insert 再靠 on conflict 擋，
  -- 每次都會用掉 191 個編號，編號很快就會用完。
  insert into units (type, name, is_renewable, footnote, first_seen_at, last_seen_at)
  select distinct on (s.type, s.name)
         s.type, s.name,
         s.type in ('太陽能', '風力', '水力', '其它再生能源'),
         s.footnote, v_time, v_time
    from _snapshot s
   where not exists (select 1 from units u where u.type = s.type and u.name = s.name)
  on conflict (type, name) do nothing;

  -- 舊機組更新「第一次／最後一次出現時間」；註記以最新的資料為準
  update units u
     set footnote      = case when v_time >= u.last_seen_at then s.footnote else u.footnote end,
         first_seen_at = least(u.first_seen_at, v_time),
         last_seen_at  = greatest(u.last_seen_at, v_time)
    from (select distinct on (type, name) type, name, footnote from _snapshot) s
   where u.type = s.type and u.name = s.name
     and (v_time > u.last_seen_at or v_time < u.first_seen_at);

  -- 寫入發電紀錄；已經存過的（同時間、同機組）自動略過
  insert into readings (observed_at, unit_id, capacity_mw, output_mw, remark)
  select v_time, u.id, s.capacity_mw, s.output_mw, s.remark
    from _snapshot s
    join units u on u.type = s.type and u.name = s.name
  on conflict (observed_at, unit_id) do nothing;
  get diagnostics v_inserted = row_count;

  insert into collection_runs (source, ok, data_time, units_seen, rows_inserted)
  values (source, true, v_time, v_units_seen, v_inserted);

  return jsonb_build_object(
    'data_time', v_time,
    'units_seen', v_units_seen,
    'rows_inserted', v_inserted
  );
end;
$$;


-- 收集失敗時記一筆（例如台電網站沒回應）
create or replace function log_collection_failure(source text, message text)
returns void
language sql
set search_path = public
as $$
  insert into collection_runs (source, ok, message) values (source, false, message);
$$;


-- ---------------------------------------------------------------------
-- 缺資料檢查：列出最近 N 天（預設 2 天）哪些 10 分鐘時間點沒有資料
-- 用法：select * from missing_slots();     或     select * from missing_slots(7);
-- ---------------------------------------------------------------------
create or replace function missing_slots(days int default 2)
returns table (slot timestamptz)
language sql stable
set search_path = public
as $$
  select s
    from generate_series(
           date_trunc('hour', now() - make_interval(days => days)),
           now() - interval '20 minutes',      -- 最近 20 分鐘可能台電還沒更新，不算
           interval '10 minutes') as s
   where not exists (select 1 from readings r where r.observed_at = s)
   order by s;
$$;


-- ---------------------------------------------------------------------
-- 安全性：開啟 RLS（Row Level Security）
-- 沒有設定任何「允許」規則 → 只有 service role 金鑰（收集程式）能讀寫，
-- 網路上的其他人什麼都看不到。之後做網站時再開放需要公開的表。
-- ---------------------------------------------------------------------
alter table statuses        enable row level security;
alter table remark_rules    enable row level security;
alter table units           enable row level security;
alter table readings        enable row level security;
alter table collection_runs enable row level security;

-- 這幾個函式只給收集程式用，不讓一般訪客呼叫
revoke execute on function ingest_snapshot(jsonb, text)       from public, anon, authenticated;
revoke execute on function log_collection_failure(text, text) from public, anon, authenticated;
revoke execute on function missing_slots(int)                 from public, anon, authenticated;
grant  execute on function ingest_snapshot(jsonb, text)       to service_role;
grant  execute on function log_collection_failure(text, text) to service_role;
grant  execute on function missing_slots(int)                 to service_role;


-- ---------------------------------------------------------------------
-- Storage：建立放原始 JSON 檔的資料夾（bucket），不公開
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('raw', 'raw', false)
on conflict (id) do nothing;
