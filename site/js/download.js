// 共用的「下載 CSV」按鈕
//
// 用法：downloadButton("檔名.csv", () => [[標題列...], [資料列...], ...])
//   第二個參數是一個函式，按下按鈕時才呼叫，所以下載的永遠是「目前畫面上」的數字
//   （例如切換成含稅之後下載，拿到的就是含稅的數字）。
//
// CSV 檔開頭加上 BOM（一個看不見的字元），Excel 打開中文才不會變亂碼。

import { el } from "./util.js";
import { t } from "./i18n.js";
import { trackEvent } from "./analytics.js";

// 一個欄位的內容：有逗號、引號或換行時要用引號包起來，裡面的引號寫兩次
function cell(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadButton(filename, getRows) {
  const b = el("button", { type: "button", className: "dl", textContent: t("downloadCsv") });
  b.onclick = () => {
    const blob = new Blob([toCsv(getRows())], { type: "text/csv;charset=utf-8" });
    const a = el("a", { href: URL.createObjectURL(blob), download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    trackEvent("download-" + filename.replace(/\.csv$/, ""));
  };
  return b;
}

// 圖表或表格下方的一列：資料來源、資料更新至、下載按鈕
//   sources：[[名稱, 網址或 null], ...]
export function cardFoot(sources, updated, button) {
  const src = el("span", { className: "src" }, [document.createTextNode(t("sourceLabel") + t("colon"))]);
  sources.forEach(([label, url], i) => {
    if (i) src.append(document.createTextNode(t("listSep")));
    src.append(url ? el("a", { href: url, target: "_blank", rel: "noopener", textContent: label }) : document.createTextNode(label));
  });
  const kids = [src];
  if (updated) kids.push(el("span", { textContent: t("updatedLabel") + t("colon") + updated }));
  if (button) kids.push(button);
  return el("div", { className: "cardfoot" }, kids);
}
