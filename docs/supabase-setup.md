# Supabase 設定步驟（給自己看的操作手冊）

設計理由請看 [supabase-plan.md](supabase-plan.md)。這份文件只寫「要按哪裡」。

> Supabase 網站的按鈕名稱偶爾會改版。如果找不到某個按鈕，
> 把畫面截圖給 Claude 看就好。

相關檔案：

| 檔案 | 用途 |
|---|---|
| `supabase/migrations/001_schema.sql` | 建立所有資料表（步驟 2） |
| `supabase/functions/collect/index.ts` | Edge Function：抓台電資料（步驟 3） |
| `supabase/import_raw.sql` | 舊資料匯入檔（步驟 5） |
| `supabase/migrations/002_schedule.sql` | pg_cron 排程（步驟 5.5） |
| `supabase/migrations/003_daily_stats.sql` | 每日彙總表（步驟 5.6） |
| `supabase/migrations/004_remove_availability.sql` | 移除 availability 欄位（步驟 5.7，只有執行過舊版 003 的資料庫需要） |
| `supabase/migrations/005_website_api.sql` | 網站需要的分類、英文名稱、彙總和讀資料的函式（步驟 5.8） |
| `supabase/migrations/006_show_remarks.sql` | 「合約限制」等備註直接顯示原文（步驟 5.9） |
| `supabase/migrations/007_trim_early_data.sql` | 排除 2026-11-13 00:00 之前的資料（步驟 5.10） |
| `supabase/migrations/008_new_unit_notices.sql` | 新機組通知（見「新機組通知」一節） |
| `supabase/make_import_sql.py` | 重新產生 `import_raw.sql` 的程式 |
| `backup_collect.py` + `.github/workflows/collect.yml` | GitHub Actions 的備援收集＋警報（步驟 6） |

---

## 步驟 1：建立 Supabase 專案

1. 打開 <https://supabase.com>，按 **Start your project**，用 GitHub 帳號登入。
2. 第一次登入會請你建立 **Organization**（組織）：名稱隨意，方案選 **Free**。
3. 按 **New project**：
   - **Project name**：`taiwan-renewables`
   - **Database Password**：按 **Generate a password**，
     **把密碼存到密碼管理工具**（之後很少用到，但忘了很麻煩）
   - **Region**：選 **Northeast Asia (Tokyo)**，離台灣最近
   - 其他選項維持預設
4. 按 **Create new project**，等 1～2 分鐘讓它建好。

## 步驟 2：建立資料表

1. 左邊選單點 **SQL Editor**。
2. 按 **+**（或 **New query**）開一個新的查詢。
3. 打開 repo 裡的 `supabase/migrations/001_schema.sql`，**全部複製**，貼進去。
4. 按右下角 **Run**（或 Ctrl/Cmd + Enter）。
   - 如果跳出「這個查詢有破壞性操作（destructive operation）」的警告，
     這是因為裡面有 `drop trigger`（先刪掉舊的再建新的），按 **Run this query** 繼續。
5. 下方出現 **Success. No rows returned** 就成功了。

**檢查：**
- 左邊選單點 **Table Editor**，應該看到 5 張表：
  `collection_runs`、`readings`、`remark_rules`、`statuses`、`units`。
  點 `remark_rules` 應該有 15 列。
- 重新整理 SQL Editor 頁面，執行 `show timezone;`，結果應該是 `Asia/Taipei`。
- 左邊選單點 **Storage**，應該看到一個叫 `raw` 的 bucket。

## 步驟 3：部署 Edge Function

1. 左邊選單點 **Edge Functions**。
2. 按 **Deploy a new function** → 選 **Via Editor**（在網頁上直接寫）。
3. 把預設的範例程式碼**全部刪掉**，換成 repo 裡
   `supabase/functions/collect/index.ts` 的全部內容。
4. 函式名稱（Function name）填 `collect`。
5. 按 **Deploy function**，等它部署完成。

## 步驟 4：手動測試一次

1. 在 `collect` 這個 function 的頁面，按右上角的 **Test**。
2. 方法（Method）選 **POST**，其他不用改，按 **Send Request**。
3. 成功的話會看到類似這樣的回應：
   ```json
   {"ok": true, "data_time": "2026-11-12T14:30:00+08:00",
    "units_seen": 191, "rows_inserted": 191, "raw": "原始檔已存 2026-11-12/1430.json.gz"}
   ```
4. **馬上再按一次 Send Request**：這次 `rows_inserted` 應該是 `0`、
   `raw` 是「原始檔之前已存過」。這表示「不會重複存」的設計有效。
5. 到 **Table Editor** 看：
   - `readings` 有 191 列
   - `units` 有 191 列
   - `collection_runs` 有 2 列，`ok` 都是 true
6. 到 **Storage** → `raw` 裡應該有一個日期資料夾，裡面有一個 `.json.gz` 檔。

**如果失敗：** 把回應的錯誤訊息，還有 function 頁面 **Logs** 分頁的內容貼給 Claude。
最可能的問題是台電擋掉 Supabase 主機的連線，那就要換別的方法，請先不要繼續下一步。

## 步驟 5：匯入舊資料

> 2026-11-13 更新：資料改從 2026-11-13 00:00 開始，之前的資料已決定排除（見步驟 5.10）。
> `make_import_sql.py` 現在只會匯入這個時間之後的資料；`data/raw` 的原始檔都在這之前，所以這個步驟已經不需要了。

`supabase/import_raw.sql` 是 repo 裡 `data/raw` 全部原始檔轉成的 SQL。

1. 在 GitHub 網頁上打開 `supabase/import_raw.sql`，按右上角的 **Copy raw file**（複製圖示）。
2. 到 Supabase **SQL Editor** 開一個新查詢，貼上，按 **Run**。
3. 到 **Table Editor** → `collection_runs`，應該多了幾列 `source` 是 `import` 的紀錄。

重複執行沒關係，已經存過的時間點會自動略過（`rows_inserted` 是 0）。

> **如果你的 Mac 上 `data/raw/` 還有沒推上 GitHub 的資料：**
> 在 Mac 的專案資料夾執行 `python3 supabase/make_import_sql.py`，
> 會重新產生 `supabase/import_raw.sql`（包含 Mac 上全部的原始檔），再照上面的方法貼上執行。

（原始檔要不要也上傳到 Storage？可以不用，它們還在 GitHub 的 `data/raw` 裡。）

## 步驟 5.5：設定 pg_cron 排程（每 3 分鐘自動收集）

1. **取得 anon key**：左下角 **Project Settings**（齒輪）→ **API Keys** →
   **Legacy API Keys** 分頁 → 複製 **anon public**（`eyJ` 開頭的一長串）。
2. 打開 `supabase/migrations/002_schedule.sql`，複製全部內容，
   貼到 SQL Editor（**下拉選單要選 Database**，不是 Logs）。
3. 把裡面兩個「請貼上…」換成你的 Project URL 和 anon key（**單引號要保留**）。
4. 按 **Run**。
5. 等 10 分鐘，執行下面的查詢，應該看到好幾列新的 `source = supabase` 紀錄：
   ```sql
   select run_at, source, ok, data_time, rows_inserted, message
   from collection_runs order by id desc limit 10;
   ```
   台電每 10 分鐘更新一次、我們每 3 分鐘抓一次，所以大部分紀錄 `rows_inserted` 是 0
   （這個時間點已經存過了），大約每 3～4 列會有一列是 191。

**如果沒有新紀錄**，執行下面兩個查詢，把結果貼給 Claude：
```sql
-- 排程有沒有在跑？
select start_time, status, return_message from cron.job_run_details order by start_time desc limit 5;
-- 呼叫 Edge Function 的結果（401 = 金鑰不對）
select created, status_code, content from net._http_response order by created desc limit 5;
```

## 步驟 5.6：每日彙總表

1. 打開 `supabase/migrations/003_daily_stats.sql`，複製全部內容，
   貼到 SQL Editor（**下拉選單選 Database**），按 **Run**。
2. 執行下面的查詢，看再生能源機組的每日數字：
   ```sql
   select d.day, u.type, u.name,
          round(d.generation_kwh)                as 發電量_度,
          round((d.capacity_factor * 100)::numeric, 1) as 容量因數_pct,
          d.capacity_mw,
          d.intervals_present                    as 時間點數,
          round((d.completeness * 100)::numeric) as 完整度_pct,
          d.flagged_remarks
   from daily_unit_stats d
   join units u on u.id = d.unit_id
   where u.is_renewable
   order by d.day desc, u.type, u.name;
   ```

之後每小時的第 20 分會自動重算「今天」和「昨天」，不用手動執行。
要手動重算某一天：`select refresh_daily_stats('2026-11-12');`

## 步驟 5.7：移除 availability（升級用）

如果資料庫是用舊版的 `001`、`003` 建立的（2026-11-12 之前），執行一次
`supabase/migrations/004_remove_availability.sql`：貼到 SQL Editor（**下拉選單選 Database**），按 **Run**。

它會移除 availability 相關的欄位並重算每日彙總。原始的發電紀錄、備註、狀態代碼都不會動。
全新安裝的資料庫不需要這一步（執行了也不會有問題）。

## 步驟 5.8：網站需要的後端

執行 `supabase/migrations/005_website_api.sql`：貼到 SQL Editor（**下拉選單選 Database**），按 **Run**。

它會建立能源分類、機組的英文名稱、每 10 分鐘的類型彙總，以及給網站讀資料的 `api_` 函式。
說明見 [database.md](database.md)。

## 步驟 5.10：排除 2026-11-13 00:00 之前的資料

執行 `supabase/migrations/007_trim_early_data.sql`：貼到 SQL Editor（**下拉選單選 Database**），按 **Run**。
最後一行會顯示「最早的資料時間」，應該是 `2026-11-13 00:00:00+08`。

## 步驟 5.9：備註直接顯示原文

執行 `supabase/migrations/006_show_remarks.sql`：貼到 SQL Editor（**下拉選單選 Database**），按 **Run**。

狀態 7 改名為「其他備註」，「合約限制」、「計劃停機」、「環保檢測」加進規則表並補上英文，
網站的狀態色帶改成直接顯示備註原文。計算方式不變。

---

## 步驟 6：GitHub Actions 改成「備援 + 警報」

> ⚠️ **順序很重要**：要等步驟 5.5 的 pg_cron 排程開始穩定收資料（觀察一兩天）之後才做這一步。
> GitHub 的排程只會用 **main 分支**上的設定。這個分支的新設定合併進 main 之前，
> 舊的 GitHub Actions 會繼續把資料存進 git。所以在那之前，資料不會漏掉。
> 但如果太早合併，在 pg_cron 開始跑之前，就只剩每 15 分鐘的備援在收資料，
> 而且「超過 40 分鐘沒新資料」的警報會一直寄信給你。

### 6-1. 取得 Supabase 網址和金鑰

在 Supabase 網站左下角點 **Project Settings**（齒輪圖示）：

- **Project URL**：在 **Data API** 頁面（舊版叫 **API**），長得像 `https://abcdefgh.supabase.co`
- **Secret key**：在 **API Keys** 頁面，**Secret keys** 區塊，按 **Reveal** 後複製（`sb_secret_` 開頭）。
  如果你只看到舊版介面，就用 **service_role** 那把（`eyJ` 開頭），兩種都可以。

> 🔒 **Secret key 等於資料庫的萬能鑰匙**：不要貼到程式碼、聊天、截圖裡。
> 只放在 GitHub Secrets 這種專門放密碼的地方。

### 6-2. 在 GitHub 設定 Secrets

1. 打開 GitHub 上的 repo 頁面 → **Settings** → 左邊 **Secrets and variables** → **Actions**。
2. 按 **New repository secret**，新增兩個：
   - Name：`SUPABASE_URL`，Secret：上面的 Project URL
   - Name：`SUPABASE_SERVICE_KEY`，Secret：上面的 Secret key

### 6-3. 合併到 main 並測試

1. 把這個分支合併到 main（可以請 Claude 幫你開 Pull Request）。
2. 到 GitHub repo 的 **Actions** 分頁 → 左邊選 **Supabase 備援收集與健康檢查** →
   右邊按 **Run workflow** 手動跑一次。
3. 綠色勾勾＝成功。點進去看 log，應該看到「健康檢查：最新資料時間……（X 分鐘前）」。

### 6-4. 收到警報信怎麼辦

GitHub 寄來「Run failed」的信，代表 Supabase 已經超過 40 分鐘沒有新資料。到 Supabase SQL Editor 執行：

```sql
-- 最近 20 次收集紀錄（看 ok 和 message）
select * from collection_runs order by run_at desc limit 20;

-- 最近 2 天缺了哪些時間點
select * from missing_slots();
```

把結果貼給 Claude 一起查原因。

---

## 步驟 7：發布網站（GitHub Pages）

1. 打開 GitHub 上的 repo 頁面 → **Settings** → 左邊 **Pages**。
2. **Build and deployment** 底下的 **Source**，選 **GitHub Actions**。（只要設定這一次。）
3. 把含有 `site/` 的修改合併進 main。
4. 到 **Actions** 分頁，等「部署網站」跑完（綠色勾勾）。
5. 網站網址：`https://hsushengfan.github.io/taiwan-renewables/`

之後只要 `site/` 有修改並合併進 main，網站就會自動更新。

---

## 警報：Healthchecks.io

收集程式每收到一筆**新的** 10 分鐘資料，就向 Healthchecks.io「報到」一次。
超過 40 分鐘沒有報到，Healthchecks.io 會寄 email 給你。
不管是收集程式壞了、Supabase 被暫停，還是台電沒有更新，都會通知。

設定步驟（只要做一次）：

1. 在 healthchecks.io 建立一個 check，**Period** 設 10 分鐘、**Grace** 設 30 分鐘。
   確認 **Integrations** 有勾選 Email。
2. 複製這個 check 的 ping 網址（`https://hc-ping.com/…`）。
3. 在 Supabase 左邊選單 **Edge Functions** → **Secrets** → 新增：
   名稱 `HEALTHCHECK_URL`，值是剛剛複製的網址。
   （ping 網址不寫在程式碼裡，因為這個 repo 是公開的：別人拿到網址就能假裝報到，讓警報失效。）
4. 把 `supabase/functions/collect/index.ts` 的最新內容貼到 Supabase 的 `collect` function，重新部署。
5. 10～20 分鐘後，Healthchecks.io 上這個 check 會變成綠色（up）。

收到警報信時，到 SQL Editor 執行 `select * from collection_runs order by run_at desc limit 20;` 查原因。

GitHub Actions 的備援已停用自動排程（從來沒有成功收到過資料），只留手動執行的按鈕。

---

## 新機組通知（Resend 寄信）

台電出現新機組時，資料庫會自動加入，收集程式會寄一封信給你，列出需要你決定的事
（英文名稱、風力是陸域還是離岸、沒看過的類型要歸哪一類）。

設定步驟（只要做一次）：

1. 執行 `supabase/migrations/008_new_unit_notices.sql`（SQL Editor，下拉選單選 Database）。
   最後一行應該顯示「還沒通知的新機組：0」。
2. 到 <https://resend.com> 註冊（可以用 Google 帳號）。用註冊的 email 收信，不需要設定網域。
3. 在 Resend 左邊選單 **API Keys** → **Create API Key**，權限選 **Sending access**，複製產生的金鑰（`re_` 開頭，只會顯示一次）。
4. 在 Supabase **Edge Functions** → **Secrets** 新增兩個：
   - `RESEND_API_KEY`：剛剛複製的金鑰
   - `NOTIFY_EMAIL`：你註冊 Resend 用的 email（要收通知信的地址）
5. 把 `supabase/functions/collect/index.ts` 的最新內容貼到 Supabase 的 `collect` function，重新部署。
6. 按 **Test** 測試：回應裡的 `newUnits` 應該是「沒有新機組」（或「不是新的時間點，不用檢查」）。

收到通知信時：把信的內容貼給 Claude，告訴它每個機組的英文名稱和分類。

---

## 常用查詢

```sql
-- 出現了哪些「規則表裡沒有」的新備註？
select remark, count(*) from readings where status_id = 7 group by remark;

-- 新增一條備註規則（例如把「計劃停機」歸為 4 停機）。
-- 舊資料會自動重新分類。記得 capacity_factor.py 的 REMARK_RULES 也要一起改！
insert into remark_rules (remark, status_id) values ('計劃停機', 4);
```
