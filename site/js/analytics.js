// 瀏覽人數統計（GoatCounter）
//
// GoatCounter 不使用 cookie，也不記錄可以辨識個人的資訊（IP 只用來當天去重複，不會存下來）。
// 網站代號設定在 config.js 的 GOATCOUNTER_CODE；沒有設定時，這個檔案什麼都不做。
//
// 我們的頁面是用網址的 # 區分的（#category-…、#unit-…），GoatCounter 預設只看 # 前面的部分，
// 所以這裡改成自己告訴它「現在是哪一頁」，每個能源類型頁、機組頁才會分開統計。

import { GOATCOUNTER_CODE } from "./config.js";

let ready = null;     // GoatCounter 的程式載入完成時才能記錄
let lastPath = null;  // 同一頁重新整理資料時不要重複記錄

export function initAnalytics() {
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (!GOATCOUNTER_CODE || local) return;
  window.goatcounter = { no_onload: true };   // 不要自動記錄，由我們決定什麼時候記錄
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
  ready = new Promise((resolve) => { s.onload = resolve; });
  document.head.append(s);
}

// 記錄一次頁面瀏覽，例如 /taiwan-renewables/#unit-173
export function trackPage(title) {
  if (!ready) return;
  const path = location.pathname + location.hash;
  if (path === lastPath) return;
  lastPath = path;
  ready.then(() => window.goatcounter?.count?.({ path, title }));
}

// 記錄一個操作，例如切換語言、切換時間範圍（在 GoatCounter 的 Events 裡看）
export function trackEvent(name) {
  if (!ready) return;
  ready.then(() => window.goatcounter?.count?.({ path: name, title: name, event: true }));
}
