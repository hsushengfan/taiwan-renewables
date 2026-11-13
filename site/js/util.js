// 各頁面共用的小工具
import { locale } from "./i18n.js";

export const $ = (sel, root = document) => root.querySelector(sel);

// 建立一個 HTML 元素：el("td", { textContent: "abc" }, [子元素...])
export const el = (tag, props = {}, kids = []) => {
  const e = document.createElement(tag);
  Object.assign(e, props);
  kids.forEach((k) => e.append(k));
  return e;
};

// 建立一個 SVG 元素（畫圖用）
export const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};

// 讀 CSS 裡定義的顏色，例如 cssVar("--g4")
export const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// 數字加千分位，例如 fmt(1234.5, 1) → "1,234.5"；沒有數字顯示「—」
export const fmt = (v, d = 0) =>
  v == null || Number.isNaN(v) ? "—" : v.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });

// 0.523 → "52.3%"
export const pct = (v) => (v == null || Number.isNaN(v) ? "—" : (v * 100).toFixed(1) + "%");

// 平均，跳過空值
export const mean = (arr) => {
  const xs = arr.filter((v) => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

// 資料庫給的時間長這樣："2026-11-13T11:20:00+08:00"。直接切字串，就一定是台灣時間。
export const hhmm = (iso) => iso.slice(11, 16);
export const mmdd = (iso) => iso.slice(5, 10);

// 毫秒 → 台灣時間的字串，例如 "2026-11-13T11:20"
export const taipeiIso = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 16);
// 時間 → 台灣的日期，例如 "2026-11-13"
export const taipeiDay = (date) => taipeiIso(date.getTime()).slice(0, 10);

// 每個資料點代表幾小時：10 分鐘 = 1/6 小時
export const HOURS_PER_POINT = { "10min": 1 / 6, hour: 1, day: 24 };
