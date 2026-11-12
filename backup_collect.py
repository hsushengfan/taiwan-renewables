"""
GitHub Actions 的「備援 + 警報」，每 15 分鐘被執行一次。

主要的收集是 Supabase 自己每 3 分鐘做（Edge Function + pg_cron）。
這支程式是另一條獨立的路：

  1. 備援收集：從 GitHub 的電腦抓一次台電資料，直接寫進 Supabase。
     就算 Supabase 的 Edge Function 壞了，這裡還有機會補到資料。
     資料庫會擋掉重複的資料，所以兩邊同時寫沒問題。
  2. 健康檢查：看資料庫最新一筆資料是不是超過 40 分鐘前。
     超過的話，這支程式會「失敗」，GitHub 就會寄 email 通知你。

需要兩個環境變數（在 GitHub repo 的 Settings → Secrets 設定）：
  SUPABASE_URL          例如 https://abcdefgh.supabase.co
  SUPABASE_SERVICE_KEY  Supabase 的 secret 金鑰（不能公開！）

在自己電腦上測試：
  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python3 backup_collect.py
"""

import gzip
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

from fetch_data import fetch  # 重複使用第一步寫好的「抓資料」功能

SOURCE = "github"
MAX_AGE_MINUTES = 40  # 最新資料超過這麼久就發警報


def get_config():
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("錯誤：沒有設定 SUPABASE_URL 或 SUPABASE_SERVICE_KEY（請到 GitHub 的 Settings → Secrets 設定）")
        sys.exit(1)
    return url, key


def request(url, key, path, body=None, content_type="application/json", extra_headers=None):
    """呼叫 Supabase 的 API，回傳解析後的 JSON。"""
    headers = {"apikey": key, "Content-Type": content_type}
    # 舊版的 service_role 金鑰（eyJ 開頭）要另外放在 Authorization；新版 sb_secret_ 金鑰只要 apikey
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    headers.update(extra_headers or {})
    if isinstance(body, (dict, list)):
        body = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url + path, data=body, headers=headers,
                                 method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            text = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}：{e.read().decode('utf-8', 'replace')}") from None
    return json.loads(text) if text else None


def backup_collect(url, key):
    """抓一次台電資料寫進 Supabase。失敗不會讓整支程式失敗（警報看的是健康檢查）。"""
    try:
        raw = fetch()
        result = request(url, key, "/rest/v1/rpc/ingest_snapshot",
                         {"raw": raw, "source": SOURCE})
        print(f"備援收集：資料時間 {raw['DateTime']}，新增 {result['rows_inserted']} 列"
              "（0 表示 Supabase 已經存過了）")
    except Exception as e:
        print(f"備援收集失敗：{e}")
        try:
            request(url, key, "/rest/v1/rpc/log_collection_failure",
                    {"source": SOURCE, "message": str(e)[:1000]})
        except Exception as e2:
            print(f"連失敗紀錄都寫不進去：{e2}")
        return

    # 原始檔存到 Storage（和 Edge Function 一樣的路徑）
    day, time = raw["DateTime"].split("T")
    path = f"{day}/{time[:2]}{time[3:5]}.json.gz"
    body = gzip.compress(json.dumps(raw, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    try:
        request(url, key, f"/storage/v1/object/raw/{path}", body,
                content_type="application/gzip", extra_headers={"x-upsert": "false"})
        print(f"原始檔已存 {path}")
    except RuntimeError as e:
        if "exists" in str(e).lower() or "duplicate" in str(e).lower():
            print("原始檔之前已存過")
        else:
            print(f"原始檔存檔失敗：{e}")


def health_check(url, key):
    """最新一筆資料超過 MAX_AGE_MINUTES 分鐘 → 回傳 False。"""
    rows = request(url, key, "/rest/v1/readings?select=observed_at&order=observed_at.desc&limit=1")
    if not rows:
        print("健康檢查失敗：資料庫裡還沒有任何資料")
        return False
    latest = datetime.fromisoformat(rows[0]["observed_at"])
    age = (datetime.now(timezone.utc) - latest).total_seconds() / 60
    print(f"健康檢查：最新資料時間 {latest.isoformat()}（{age:.0f} 分鐘前）")
    if age > MAX_AGE_MINUTES:
        print(f"⚠️ 已經超過 {MAX_AGE_MINUTES} 分鐘沒有新資料！請到 Supabase 查 collection_runs 表")
        return False
    return True


def main():
    url, key = get_config()
    backup_collect(url, key)
    if not health_check(url, key):
        sys.exit(1)  # 讓 GitHub Actions 顯示失敗，GitHub 會寄 email


if __name__ == "__main__":
    main()
