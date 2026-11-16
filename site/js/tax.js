// 含稅／未稅切換
//
// 資料庫一律存「未稅」值，含稅＝未稅 × 1.05（營業稅 5%）。
// 訪客還沒選過時，各頁用自己的預設值（電價走勢頁預設含稅、轉供費率頁預設未稅）；
// 選過一次之後記住，所有頁面都照這個選擇。

import { el } from "./util.js";
import { t } from "./i18n.js";

export const TAX_RATE = 1.05;
const KEY = "taxMode";   // "incl" 含稅 | "excl" 未稅

export function taxMode(pageDefault) {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "incl" || v === "excl") return v;
  } catch { /* 讀不到就用這頁的預設值 */ }
  return pageDefault;
}

function setTaxMode(mode) {
  try { localStorage.setItem(KEY, mode); } catch { /* 存不了也沒關係，這次還是會切換 */ }
}

// 未稅值 → 目前要顯示的值
export const applyTax = (v, mode) => (v == null ? null : mode === "incl" ? v * TAX_RATE : v);

// 「含稅」或「未稅」的文字，放在圖表標題旁
export const taxLabel = (mode) => t(mode === "incl" ? "taxIncl" : "taxExcl");

// 切換鈕。onChange(新的模式) 由頁面負責重畫
export function taxToggle(mode, onChange) {
  const box = el("div", { className: "seg" });
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", t("taxToggleLabel"));
  [["incl", t("taxIncl")], ["excl", t("taxExcl")]].forEach(([m, label]) => {
    const b = el("button", { type: "button", textContent: label });
    b.setAttribute("aria-pressed", m === mode);
    b.onclick = () => { if (m !== mode) { setTaxMode(m); onChange(m); } };
    box.append(b);
  });
  return box;
}
