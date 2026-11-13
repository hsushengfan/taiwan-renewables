# 專案規則

- **資料庫結構有改，就要同步更新 `docs/database.md`。**
  新增、刪除、修改資料表、欄位、view、函式或排程（`supabase/migrations/` 裡的任何變更），
  都要在同一次修改裡更新這份文件。
- 備註分類規則有兩份，要一起改：`capacity_factor.py` 的 `REMARK_RULES`
  和 `supabase/migrations/001_schema.sql` 的 `remark_rules`。
  改完執行 `python3 -m unittest tests/test_rules_match.py` 確認一致。
- 計算方法或假設有改，要同步更新 `docs/methodology.md`，以及網站的關於頁 `site/js/views/about.js`（中英文都要改）。
- 使用者是程式新手：文件和程式註解用簡單的中文說明理由。
- **收到新機組通知時**（使用者貼上通知信）：用一個新的 SQL 檔（`supabase/migrations/`）更新 `units.name_en`、
  需要時更新 `units.category_id`（離岸風場改成 11），然後 `select refresh_category_readings();`；
  同時更新 `docs/unit-names.md` 對照表。
