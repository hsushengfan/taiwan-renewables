"""
計算機組的 availability（可用率）和容量因數。

計算方法和假設的完整說明在 docs/methodology.md。網站呈現數字時，要一起附上那份說明。

兩個指標（都是「每 10 分鐘」先各算一次）：
  - availability ＝ 這段時間「能發」的電 ÷ 裝置容量
  - 容量因數     ＝ 這段時間「實際發」的電 ÷ 裝置容量

台電只告訴我們「實際發了多少」，所以「能發多少」要靠「備註」來判斷：
  - 空白（正常）              → 能發 = 裝置容量，availability 100%
  - 主動少發（配合綠電先行…） → 是「選擇不發」，availability 100%
  - 檢修、故障、運轉限制…     → 是「發不出來」，能發 = 實際發電量
  - 沒看過的備註              → 保守當作「發不出來」，並印出警告

日、月、年的平均：把這段期間每 10 分鐘的值平均起來。

使用方式：
    python3 availability.py 2026-11-10              # 算一天
    python3 availability.py 2026-11-01 2026-11-30   # 算一段日期
"""

import csv
import sys
from collections import Counter, defaultdict
from datetime import date

from clean_data import CLEAN_DIR, PROJECT, load_range, warn

# ---------------------------------------------------------------
# 備註的分類規則。之後出現新的備註，就加到這裡。
# 資料庫裡也有一份一樣的規則（supabase/migrations/001_schema.sql 的 remark_rules），
# 兩邊要一起改；tests/test_rules_match.py 會檢查兩邊是否一致。
# ---------------------------------------------------------------
NORMAL = "正常"
VOLUNTARY = "主動少發"        # 選擇不發，不影響 availability
PARTIAL_OUTAGE = "部分停機"   # 發不出來（部分）
FULL_OUTAGE = "停機"          # 發不出來（全部）
UNKNOWN_STATUS = "狀態不明"   # 這個時間點不算
TESTING = "試運轉"            # 還沒正式商轉，這個時間點不算
UNKNOWN_REMARK = "未知備註"   # 規則表裡沒有的備註，保守當作發不出來

REMARK_RULES = {
    "": NORMAL,
    "配合綠電先行": VOLUNTARY,
    "友善降載減排": VOLUNTARY,
    "部分檢修": PARTIAL_OUTAGE,
    "部分歲修": PARTIAL_OUTAGE,
    "部分故障": PARTIAL_OUTAGE,
    "運轉限制": PARTIAL_OUTAGE,
    "環保限制": PARTIAL_OUTAGE,
    "檢修": FULL_OUTAGE,
    "歲修": FULL_OUTAGE,
    "故障": FULL_OUTAGE,
    "通訊異常": UNKNOWN_STATUS,
    "新機組試俥": TESTING,
    "新增設備測試運轉": TESTING,
    "測試運轉": TESTING,
}

# 這幾類的 availability 一律是 100%（不管實際發多少）
FULLY_AVAILABLE = {NORMAL, VOLUNTARY}
# 這幾類用「實際發電量 ÷ 容量」當作 availability
OUTPUT_LIMITED = {PARTIAL_OUTAGE, FULL_OUTAGE, UNKNOWN_REMARK}
# 這幾類要在網站上特別標註
FLAGGED = {PARTIAL_OUTAGE, FULL_OUTAGE, UNKNOWN_REMARK}

INTERVALS_PER_DAY = 144  # 台電每 10 分鐘一筆，一天 144 筆


def classify(remark):
    status = REMARK_RULES.get(remark)
    if status is None:
        warn(f"沒看過的備註 {remark!r}，先保守當作「發不出來」。請把它加進 REMARK_RULES")
        return UNKNOWN_REMARK
    return status


def clamp(x):
    """限制在 0 ~ 1 之間。發電量偶爾會超過裝置容量（例如 104%），一律最多算 100%。"""
    return max(0.0, min(1.0, x))


def evaluate(row):
    """
    算一個機組在一個時間點的 availability 和容量因數。
    回傳 dict；如果這個時間點不能算，availability 會是 None，並在 skip_reason 說明原因。
    """
    status = classify(row["remark"])
    cap = row["capacity_mw"]
    out = row["output_mw"]
    result = {**row, "status": status, "availability": None,
              "capacity_factor": None, "skip_reason": ""}

    if cap is None or cap <= 0:
        result["skip_reason"] = "沒有裝置容量"
    elif status == TESTING:
        result["skip_reason"] = "試運轉中"
    elif status == UNKNOWN_STATUS:
        result["skip_reason"] = "通訊異常，狀態不明"
    elif status in FULLY_AVAILABLE:
        result["availability"] = 1.0
        if out is not None:
            result["capacity_factor"] = clamp(out / cap)
    elif out is None:
        result["skip_reason"] = "發不出來，但沒有發電量數字"
    else:  # OUTPUT_LIMITED
        result["availability"] = clamp(out / cap)
        result["capacity_factor"] = clamp(out / cap)
    return result


def mean(values):
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else None


def summarize_units(evaluated):
    """
    每個機組在這段期間的平均 availability 和容量因數。
    也記錄每種狀態出現幾次，網站上要用來標註「這段期間有檢修」。
    """
    by_unit = defaultdict(list)
    for r in evaluated:
        by_unit[r["unit_id"]].append(r)

    summaries = []
    for unit_id, rs in by_unit.items():
        last = rs[-1]
        flagged = Counter(r["remark"] for r in rs if r["status"] in FLAGGED)
        summaries.append({
            "unit_id": unit_id,
            "type": last["type"],
            "name": last["name"],
            "renewable": last["renewable"],
            "capacity_mw": last["capacity_mw"],
            "availability": mean(r["availability"] for r in rs),
            "capacity_factor": mean(r["capacity_factor"] for r in rs),
            "intervals_used": sum(r["availability"] is not None for r in rs),
            "intervals_total": len(rs),
            "flagged": flagged,  # 例如 Counter({"部分檢修": 12, "檢修": 3})
            "skip_reasons": Counter(r["skip_reason"] for r in rs if r["skip_reason"]),
        })
    return summaries


def summarize_types(evaluated):
    """
    每一類（例如「風力」）在這段期間的平均 availability 和容量因數。

    每個時間點先用「裝置容量加權」算出整類的值：
        整類 availability = 各機組能發的電加總 ÷ 各機組裝置容量加總
    這樣大機組的影響比較大，比較符合實際：一座 600 MW 風場停機，
    比一座 20 MW 風場停機影響大得多。最後再把每個時間點的值平均。
    """
    per_time = defaultdict(lambda: {"cap": 0.0, "avail": 0.0,
                                    "cf_cap": 0.0, "cf": 0.0})
    flagged = defaultdict(set)
    for r in evaluated:
        if r["availability"] is None:
            continue
        cell = per_time[(r["type"], r["time"])]
        cell["cap"] += r["capacity_mw"]
        cell["avail"] += r["availability"] * r["capacity_mw"]
        if r["capacity_factor"] is not None:
            cell["cf_cap"] += r["capacity_mw"]
            cell["cf"] += r["capacity_factor"] * r["capacity_mw"]
        if r["status"] in FLAGGED:
            flagged[r["type"]].add(r["name"])

    by_type = defaultdict(list)
    for (unit_type, _time), cell in per_time.items():
        by_type[unit_type].append(cell)

    summaries = []
    for unit_type, cells in by_type.items():
        summaries.append({
            "type": unit_type,
            "availability": mean(c["avail"] / c["cap"] for c in cells),
            "capacity_factor": mean(c["cf"] / c["cf_cap"] if c["cf_cap"] else None
                                    for c in cells),
            "intervals": len(cells),
            "flagged_units": sorted(flagged[unit_type]),  # 這段期間曾檢修或故障的機組
        })
    return summaries


def pct(x):
    return "-" if x is None else f"{x * 100:.1f}%"


def save_csv(rows, path, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            r = dict(r)
            for k in ("flagged", "skip_reasons"):
                if k in r:
                    r[k] = "、".join(f"{name} {n} 次" for name, n in r[k].items())
            if "flagged_units" in r:
                r["flagged_units"] = "、".join(r["flagged_units"])
            writer.writerow(r)


def main():
    if len(sys.argv) not in (2, 3):
        print("用法：python3 availability.py 開始日期 [結束日期]")
        print("例如：python3 availability.py 2026-11-10")
        sys.exit(1)
    start = sys.argv[1]
    end = sys.argv[2] if len(sys.argv) == 3 else start

    rows = load_range(start, end)
    if not rows:
        print(f"找不到 {start} ~ {end} 的資料")
        sys.exit(1)

    evaluated = [evaluate(r) for r in rows]
    units = summarize_units(evaluated)
    types = summarize_types(evaluated)

    times = {r["time"] for r in rows}
    days = (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
    expected = days * INTERVALS_PER_DAY
    print(f"期間 {start} ~ {end}，共 {len(times)} 個時間點"
          f"（應有 {expected} 個，資料完整度 {len(times) / expected:.0%}）")
    print("（備註判斷規則與假設：docs/methodology.md）\n")
    print(f"{'類型':<10}{'availability':>14}{'容量因數':>10}   曾檢修／故障的機組")
    for t in sorted(types, key=lambda t: (t["type"] not in {"太陽能", "風力", "水力", "其它再生能源"}, t["type"])):
        flagged = "、".join(t["flagged_units"]) or "（無）"
        print(f"{t['type']:<10}{pct(t['availability']):>14}{pct(t['capacity_factor']):>12}   {flagged}")

    label = start if start == end else f"{start}_{end}"
    unit_path = CLEAN_DIR / f"availability_units_{label}.csv"
    type_path = CLEAN_DIR / f"availability_types_{label}.csv"
    save_csv(units, unit_path, ["unit_id", "type", "name", "renewable", "capacity_mw",
                                "availability", "capacity_factor", "intervals_used",
                                "intervals_total", "flagged", "skip_reasons"])
    save_csv(types, type_path, ["type", "availability", "capacity_factor",
                                "intervals", "flagged_units"])
    print(f"\n各機組明細：{unit_path.relative_to(PROJECT)}")
    print(f"各類型彙總：{type_path.relative_to(PROJECT)}")


if __name__ == "__main__":
    main()
