"""
計算機組的容量因數，並把台電的「備註」分類成狀態。

計算方法和假設的完整說明在 docs/methodology.md。

  - 容量因數 ＝ 實際發電量 ÷ 裝置容量（每 10 分鐘各算一次，再取平均）
  - 狀態     ＝ 把台電的備註分成幾類（正常、主動少發、部分停機、停機…），
               網站用它畫「狀態色帶」

為什麼不算 availability（可用率）？
台電只提供「裝置容量」和「實際發電量」，沒有提供「實際可用的容量」，
所以真正的 availability 算不出來。詳見 docs/methodology.md。

使用方式：
    python3 capacity_factor.py 2026-11-10              # 算一天
    python3 capacity_factor.py 2026-11-01 2026-11-30   # 算一段日期
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
VOLUNTARY = "主動少發"        # 調度要求降低出力，設備本身可以發電
PARTIAL_OUTAGE = "部分停機"
FULL_OUTAGE = "停機"
UNKNOWN_STATUS = "狀態不明"   # 通訊異常，發電量數字不可靠
TESTING = "試運轉"            # 還沒正式商轉
OTHER_REMARK = "其他備註"     # 不屬於上面幾類的備註：網站直接顯示備註原文

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
    "合約限制": OTHER_REMARK,
    "計劃停機": OTHER_REMARK,
    "環保檢測": OTHER_REMARK,
}

# 這幾類的時間點不列入容量因數的計算
EXCLUDED = {UNKNOWN_STATUS, TESTING}
# 這幾類要在網站上特別標註
FLAGGED = {PARTIAL_OUTAGE, FULL_OUTAGE, OTHER_REMARK}

INTERVALS_PER_DAY = 144  # 台電每 10 分鐘一筆，一天 144 筆


def classify(remark):
    status = REMARK_RULES.get(remark)
    if status is None:
        warn(f"沒看過的備註 {remark!r}，先歸為「其他備註」。請把它加進 REMARK_RULES")
        return OTHER_REMARK
    return status


def clamp(x):
    """限制在 0 ~ 1 之間。發電量偶爾會超過裝置容量（例如 104%），一律最多算 100%。"""
    return max(0.0, min(1.0, x))


def evaluate(row):
    """
    算一個機組在一個時間點的容量因數。
    回傳 dict；如果這個時間點不能算，capacity_factor 會是 None，並在 skip_reason 說明原因。
    """
    status = classify(row["remark"])
    cap = row["capacity_mw"]
    out = row["output_mw"]
    result = {**row, "status": status, "capacity_factor": None, "skip_reason": ""}

    if cap is None or cap <= 0:
        result["skip_reason"] = "沒有裝置容量"
    elif status == TESTING:
        result["skip_reason"] = "試運轉中"
    elif status == UNKNOWN_STATUS:
        result["skip_reason"] = "通訊異常，狀態不明"
    elif out is None:
        result["skip_reason"] = "沒有發電量數字"
    else:
        result["capacity_factor"] = clamp(out / cap)
    return result


def mean(values):
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else None


def summarize_units(evaluated):
    """
    每個機組在這段期間的平均容量因數。
    也記錄停機類備註各出現幾次，網站上要用來標註「這段期間有檢修」。
    """
    by_unit = defaultdict(list)
    for r in evaluated:
        by_unit[r["unit_id"]].append(r)

    summaries = []
    for unit_id, rs in by_unit.items():
        last = rs[-1]
        summaries.append({
            "unit_id": unit_id,
            "type": last["type"],
            "name": last["name"],
            "renewable": last["renewable"],
            "capacity_mw": last["capacity_mw"],
            "capacity_factor": mean(r["capacity_factor"] for r in rs),
            "intervals_used": sum(r["capacity_factor"] is not None for r in rs),
            "intervals_total": len(rs),
            "flagged": Counter(r["remark"] for r in rs if r["status"] in FLAGGED),
            "skip_reasons": Counter(r["skip_reason"] for r in rs if r["skip_reason"]),
        })
    return summaries


def summarize_types(evaluated):
    """
    每一類（例如「風力」）在這段期間的平均容量因數。

    每個時間點先算整類的值：
        整類容量因數 = 各機組發電量加總 ÷ 各機組裝置容量加總
    這樣大機組的影響比較大，比較符合實際。最後再把每個時間點的值平均。
    """
    per_time = defaultdict(lambda: {"cap": 0.0, "out": 0.0})
    flagged = defaultdict(set)
    for r in evaluated:
        if r["status"] in FLAGGED:
            flagged[r["type"]].add(r["name"])
        if r["capacity_factor"] is None:
            continue
        cell = per_time[(r["type"], r["time"])]
        cell["cap"] += r["capacity_mw"]
        cell["out"] += r["capacity_factor"] * r["capacity_mw"]

    by_type = defaultdict(list)
    for (unit_type, _time), cell in per_time.items():
        by_type[unit_type].append(cell)

    summaries = []
    for unit_type, cells in by_type.items():
        summaries.append({
            "type": unit_type,
            "capacity_factor": mean(c["out"] / c["cap"] for c in cells),
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
        print("用法：python3 capacity_factor.py 開始日期 [結束日期]")
        print("例如：python3 capacity_factor.py 2026-11-10")
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
    print("（計算方法與假設：docs/methodology.md）\n")
    print(f"{'類型':<10}{'容量因數':>10}   曾檢修／故障的機組")
    for t in sorted(types, key=lambda t: (t["type"] not in {"太陽能", "風力", "水力", "其它再生能源"}, t["type"])):
        flagged = "、".join(t["flagged_units"]) or "（無）"
        print(f"{t['type']:<10}{pct(t['capacity_factor']):>12}   {flagged}")

    label = start if start == end else f"{start}_{end}"
    unit_path = CLEAN_DIR / f"capacity_factor_units_{label}.csv"
    type_path = CLEAN_DIR / f"capacity_factor_types_{label}.csv"
    save_csv(units, unit_path, ["unit_id", "type", "name", "renewable", "capacity_mw",
                                "capacity_factor", "intervals_used", "intervals_total",
                                "flagged", "skip_reasons"])
    save_csv(types, type_path, ["type", "capacity_factor", "intervals", "flagged_units"])
    print(f"\n各機組明細：{unit_path.relative_to(PROJECT)}")
    print(f"各類型彙總：{type_path.relative_to(PROJECT)}")


if __name__ == "__main__":
    main()
