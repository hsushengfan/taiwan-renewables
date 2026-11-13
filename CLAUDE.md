# 專案規則

- **資料庫結構有改，就要同步更新 `docs/database.md`。**
  新增、刪除、修改資料表、欄位、view、函式或排程（`supabase/migrations/` 裡的任何變更），
  都要在同一次修改裡更新這份文件。
- 備註分類規則有兩份，要一起改：`capacity_factor.py` 的 `REMARK_RULES`
  和 `supabase/migrations/001_schema.sql` 的 `remark_rules`。
  改完執行 `python3 -m unittest tests/test_rules_match.py` 確認一致。
- 計算方法或假設有改，要同步更新 `docs/methodology.md`。
- 使用者是程式新手：文件和程式註解用簡單的中文說明理由。
