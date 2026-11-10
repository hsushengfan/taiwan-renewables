"""
自動存資料：抓一次台電即時資料，如果是「新的時間點」就存起來。

這支程式會被 macOS 的排程每 5 分鐘叫一次。
台電每 10 分鐘才更新一次，所以大約每兩次只會存到一次新資料；
另一次發現「這個時間點已經存過了」就直接跳過。這樣比較不會漏掉資料。

存檔位置（依照資料時間 DateTime 命名）：
    data/raw/2026-11-10/1130.json.gz

.gz 是壓縮檔，大約只有原本的 1/8 大，一年下來可以省很多空間。
用 Python 讀回來的方法：
    import gzip, json
    data = json.load(gzip.open("data/raw/2026-11-10/1130.json.gz", "rt", encoding="utf-8"))
"""

import gzip
import json
import os
from datetime import datetime
from pathlib import Path

from fetch_data import fetch  # 重複使用第一步寫好的「抓資料」功能

PROJECT = Path(__file__).parent
RAW_DIR = PROJECT / "data" / "raw"
LOG_FILE = PROJECT / "data" / "collect.log"


def log(message):
    """在 data/collect.log 加一行紀錄，出問題時可以回來查。"""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"{now}  {message}\n")
    print(message)


def main():
    try:
        data = fetch()
    except Exception as e:  # 網路斷線、台電網站掛掉等等
        log(f"抓取失敗：{e!r}")
        return

    # 資料時間，例如 "2026-11-10T11:30:00"
    data_time = datetime.fromisoformat(data["DateTime"])
    path = RAW_DIR / data_time.strftime("%Y-%m-%d") / (data_time.strftime("%H%M") + ".json.gz")

    if path.exists():
        log(f"跳過：{data['DateTime']} 已經存過了")
        return

    path.parent.mkdir(parents=True, exist_ok=True)

    # 先寫到暫存檔，寫完再改名。
    # 這樣就算寫到一半電腦睡著，也不會留下壞掉的檔案。
    tmp = path.with_suffix(".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)

    log(f"已存：{data['DateTime']}，{len(data['aaData'])} 筆 → {path.relative_to(PROJECT)}")


if __name__ == "__main__":
    main()
