"""
抓取「台灣電力公司各機組發電量即時資訊」並存成 data/sample.json

資料來源：https://data.gov.tw/dataset/8931
原始 JSON：https://service.taipower.com.tw/data/opendata/apply/file/d006001/001.json

使用方式（在專案資料夾裡執行）：
    python3 fetch_data.py
"""

import json
import urllib.request
from pathlib import Path

# 台電真正提供 JSON 的網址（data.gov.tw 頁面上的「下載」按鈕就是指向這裡）
URL = "https://service.taipower.com.tw/data/opendata/apply/file/d006001/001.json"

# 存檔位置：跟這支程式同一層的 data/sample.json
OUTPUT = Path(__file__).parent / "data" / "sample.json"


def fetch():
    # 有些網站會擋掉沒有 User-Agent 的程式，所以加一個常見的瀏覽器標頭
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw_bytes = resp.read()

    # 台電的檔案開頭有一個看不見的 BOM 字元，用 "utf-8-sig" 解碼可以自動去掉它，
    # 否則 json.loads 會報錯
    text = raw_bytes.decode("utf-8-sig")
    return json.loads(text)


def main():
    data = fetch()

    # 確保 data 資料夾存在
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    # ensure_ascii=False 讓中文直接存成中文（而不是 機 這種編碼）
    # indent=2 讓檔案排版整齊，方便用眼睛看
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"資料時間：{data['DateTime']}")
    print(f"共 {len(data['aaData'])} 筆，已存到 {OUTPUT}")


if __name__ == "__main__":
    main()
