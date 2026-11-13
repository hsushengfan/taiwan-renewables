"""
把 data/raw 裡的原始檔，轉成一個可以貼到 Supabase SQL Editor 執行的 SQL 檔。

使用方式（在專案資料夾裡執行）：
    python3 supabase/make_import_sql.py
輸出：supabase/import_raw.sql

每個原始檔會變成一行：
    select ingest_snapshot('{...原始 JSON...}'::jsonb, 'import');
和 Edge Function 用的是同一個函式，所以整理規則完全一樣。
已經存過的時間點會自動略過，重複執行沒關係。

只匯入 DATA_START 之後的資料：資料從第一個完整的一天（2026-11-13）開始，
之前的資料不完整，不具代表性（見 supabase/migrations/007_trim_early_data.sql）。
data/raw 裡的原始檔都在這之前，所以現在產生的匯入檔是空的。
"""

import json
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))
from clean_data import RAW_DIR, read_snapshot  # noqa: E402

OUTPUT = PROJECT / "supabase" / "import_raw.sql"

# 資料的起始時間（台灣時間）：第一個從 00:00 開始、每 10 分鐘都有資料的一天
DATA_START = "2026-11-13T00:00:00"


def sql_literal(text):
    """把文字變成 SQL 字串：前後加單引號，裡面的單引號要寫兩次。"""
    return "'" + text.replace("'", "''") + "'"


def main():
    paths = sorted(RAW_DIR.glob("*/*.json.gz"))
    if not paths:
        print(f"{RAW_DIR} 裡沒有原始檔")
        sys.exit(1)

    lines = ["-- 由 supabase/make_import_sql.py 產生，貼到 Supabase SQL Editor 執行"]
    skipped = 0
    for path in paths:
        raw = read_snapshot(path)
        if raw["DateTime"] < DATA_START:
            skipped += 1
            continue
        text = json.dumps(raw, ensure_ascii=False, separators=(",", ":"))
        lines.append(f"select ingest_snapshot({sql_literal(text)}::jsonb, 'import');")

    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"{len(paths) - skipped} 個時間點 → {OUTPUT.relative_to(PROJECT)}（{size_kb:.0f} KB）"
          f"；略過 {DATA_START} 之前的 {skipped} 個")


if __name__ == "__main__":
    main()
