"""
讀取收集到的台電資料，整理成乾淨的表格。

台電的原始資料有很多不方便的地方，這支程式統一處理：
  - 數字都是字串（"742.7"）→ 轉成真正的數字（742.7）
  - "-"、"N/A" 代表沒有數字 → 變成 None（Python 的「空值」）
  - 每一類最後有「小計」列 → 去掉，避免重複計算
  - 「儲能負載」列是儲能機組充電用掉的電 → 去掉
  - 名稱帶註記，例如 "台中CC#2(註10)" → 名稱 "台中CC#2"，註記 "10" 另外存
  - 類型名稱裡混了網頁標籤 "</b>" → 去掉
  - 備註的空白有 " " 和 "" 兩種 → 統一成 ""

整理後每一列（row）是一個 dict，代表「某個時間點的某個機組」：
  {
    "time": "2026-11-10T11:50:00",   資料時間
    "type": "風力",                   機組類型
    "name": "沃一風",                 機組名稱（去掉註記）
    "unit_id": "風力|沃一風",          機組代號（類型+名稱，用來辨識同一個機組）
    "footnote": "",                   名稱上的註記編號，例如 "10"；沒有就是 ""
    "renewable": True,                是不是再生能源
    "capacity_mw": 605.2,             裝置容量(MW)，沒有就是 None
    "output_mw": 587.4,               淨發電量(MW)，沒有就是 None
    "remark": "",                     備註，正常運轉是 ""
  }

為什麼需要 unit_id？因為不同類型裡可能有同名的機組，
例如太陽能和風力都有一列叫「其它台電自有」，只看名稱會搞混。

使用方式：
  在終端機執行，把某一天的資料整理成 CSV（可以用 Excel 打開）：
      python3 clean_data.py 2026-11-10
  輸出：data/clean/2026-11-10.csv

  在其他程式裡使用：
      from clean_data import load_day
      rows = load_day("2026-11-10")
"""

import csv
import gzip
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

PROJECT = Path(__file__).parent
RAW_DIR = PROJECT / "data" / "raw"
CLEAN_DIR = PROJECT / "data" / "clean"

# 再生能源的類型。儲能（抽蓄水力、電池）只是存電再放電，不算再生能源。
RENEWABLE_TYPES = {"太陽能", "風力", "水力", "其它再生能源"}

# 這些字代表「沒有數字」
EMPTY_VALUES = {"", "-", "N/A", "NA"}

# 輸出 CSV 的欄位順序
FIELDS = ["time", "type", "name", "unit_id", "footnote", "renewable",
          "capacity_mw", "output_mw", "remark"]

# 用來找出名稱裡的註記，例如 "(註10)"、"（註 4）"
FOOTNOTE_PATTERN = re.compile(r"[(（]\s*註\s*(\d+)\s*[)）]")
# 用來找出網頁標籤，例如 "</b>"
HTML_TAG_PATTERN = re.compile(r"<[^>]+>")

# 記錄已經警告過的怪值，同一個值只警告一次，避免畫面被洗版
_warned = set()


def warn(message):
    if message not in _warned:
        _warned.add(message)
        print(f"警告：{message}", file=sys.stderr)


def parse_number(text, field, name):
    """把 "742.7" 轉成 742.7；沒有數字的話回傳 None。"""
    text = text.strip().replace(",", "").rstrip("%")
    if text in EMPTY_VALUES:
        return None
    try:
        return float(text)
    except ValueError:
        # 出現從沒看過的格式時不要當掉，記成 None 並提醒一下
        warn(f"{name} 的 {field} 是看不懂的值 {text!r}，先當成空值")
        return None


def clean_type(raw_type):
    """'儲能負載(Energy Storage System Load)</b>' → '儲能負載(Energy Storage System Load)'"""
    return HTML_TAG_PATTERN.sub("", raw_type).strip()


def clean_name(raw_name):
    """'台中CC#2(註10)' → ('台中CC#2', '10')；有多個註記時用逗號連起來。"""
    footnotes = FOOTNOTE_PATTERN.findall(raw_name)
    name = FOOTNOTE_PATTERN.sub("", raw_name).strip()
    return name, ",".join(footnotes)


def is_subtotal(name):
    """「小計」或「小計(註5)」這種加總列。"""
    return name.startswith("小計")


def is_storage_load(unit_type):
    """「儲能負載」列：儲能機組充電時用掉的電。"""
    return unit_type.startswith("儲能負載")


def read_snapshot(path):
    """讀一個原始檔，.json 或 .json.gz 都可以。"""
    path = Path(path)
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8-sig") as f:
            return json.load(f)
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def clean_snapshot(raw):
    """把一個時間點的原始資料，整理成一列一列乾淨的資料。"""
    time = raw["DateTime"]
    rows = []
    for item in raw["aaData"]:
        unit_type = clean_type(item["機組類型"])
        name, footnote = clean_name(item["機組名稱"])

        if is_subtotal(name) or is_storage_load(unit_type):
            continue

        rows.append({
            "time": time,
            "type": unit_type,
            "name": name,
            "unit_id": f"{unit_type}|{name}",
            "footnote": footnote,
            "renewable": unit_type in RENEWABLE_TYPES,
            "capacity_mw": parse_number(item["裝置容量(MW)"], "裝置容量", name),
            "output_mw": parse_number(item["淨發電量(MW)"], "淨發電量", name),
            "remark": item["備註"].strip(),
        })
    return rows


def load_day(day):
    """讀某一天（例如 "2026-11-10"）所有時間點的資料，依時間排序。"""
    rows = []
    for path in sorted((RAW_DIR / day).glob("*.json.gz")):
        rows.extend(clean_snapshot(read_snapshot(path)))
    return rows


def load_range(start_day, end_day):
    """讀一段日期（包含頭尾兩天）的資料，例如 load_range("2026-11-01", "2026-11-07")。"""
    start = date.fromisoformat(start_day)
    end = date.fromisoformat(end_day)
    rows = []
    while start <= end:
        rows.extend(load_day(start.isoformat()))
        start += timedelta(days=1)
    return rows


def save_csv(rows, path):
    """存成 CSV。用 utf-8-sig 編碼，Excel 打開中文才不會變亂碼。"""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def main():
    if len(sys.argv) != 2:
        print("用法：python3 clean_data.py 2026-11-10")
        sys.exit(1)

    day = sys.argv[1]
    rows = load_day(day)
    if not rows:
        print(f"找不到 {day} 的資料（應該放在 {RAW_DIR / day}/）")
        sys.exit(1)

    times = sorted({r["time"] for r in rows})
    units = {r["unit_id"] for r in rows}
    renewable_units = {r["unit_id"] for r in rows if r["renewable"]}

    out = CLEAN_DIR / f"{day}.csv"
    save_csv(rows, out)

    print(f"{day}：{len(times)} 個時間點（{times[0][11:16]} ~ {times[-1][11:16]}）")
    print(f"機組 {len(units)} 個，其中再生能源 {len(renewable_units)} 個")
    print(f"共 {len(rows)} 列，已存到 {out.relative_to(PROJECT)}")


if __name__ == "__main__":
    main()
