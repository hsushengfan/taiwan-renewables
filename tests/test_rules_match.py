"""
檢查「備註分類規則」在 Python（availability.py）和資料庫（001_schema.sql）兩邊是否完全一樣。

執行方式（在專案資料夾裡）：
    python3 -m unittest tests/test_rules_match.py
"""

import re
import sys
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))
import availability  # noqa: E402

SCHEMA = PROJECT / "supabase" / "migrations" / "001_schema.sql"


def sql_block(text, table):
    """取出 `insert into <table> ... on conflict` 中間那段。"""
    match = re.search(rf"insert into {table} .*?values(.*?)on conflict", text, re.S)
    return match.group(1)


class RulesMatch(unittest.TestCase):
    def setUp(self):
        text = SCHEMA.read_text(encoding="utf-8")
        # statuses：(1, '正常', ...) → {1: '正常'}
        self.statuses = {int(i): name for i, name in
                         re.findall(r"\((\d+),\s*'([^']*)'", sql_block(text, "statuses"))}
        # remark_rules：('檢修', 4) → {'檢修': '停機'}
        self.sql_rules = {remark: self.statuses[int(i)] for remark, i in
                          re.findall(r"\('([^']*)',\s*(\d+)\)", sql_block(text, "remark_rules"))}

    def test_same_rules(self):
        self.assertEqual(availability.REMARK_RULES, self.sql_rules)

    def test_unknown_remark_status(self):
        self.assertEqual(self.statuses[7], availability.UNKNOWN_REMARK)


if __name__ == "__main__":
    unittest.main()
