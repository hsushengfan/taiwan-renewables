// 網站的主程式：決定現在要顯示哪一頁、讀資料、每 3 分鐘自動更新。
//
// 三種頁面，由網址最後的 # 決定（可以加書籤、可以分享）：
//   （沒有 #）              總覽頁            views/overview.js
//   #category-wind_offshore 能源類型頁        views/category.js
//   #unit-173               機組頁            views/unit.js
//   #about                  關於／計算方法    views/about.js
//
// 每一頁都有兩個函式：
//   load(ctx, ...)    向 Supabase 讀這一頁需要的資料
//   render(root, ...) 用讀到的資料畫出畫面（換語言、改視窗大小時只重畫，不重讀）

import { REFRESH_MS } from "./config.js";
import { getMeta } from "./api.js";
import { t, getLang, setLang } from "./i18n.js";
import { $, el, taipeiIso } from "./util.js";
import * as overview from "./views/overview.js";
import * as category from "./views/category.js";
import * as unit from "./views/unit.js";
import * as about from "./views/about.js";

// 時間範圍：往回看幾小時、用哪種粒度
const RANGES = { "24h": { hours: 24, bucket: "10min" }, "7d": { hours: 24 * 7, bucket: "10min" } };

const state = { range: "24h", route: null, ctx: null, data: null, loadId: 0 };

// 網址的 # → 要顯示哪一頁
function parseRoute() {
  const h = decodeURIComponent(location.hash.slice(1));
  let m;
  if ((m = h.match(/^category-([a-z_]+)$/))) return { view: category, arg: m[1], key: h };
  if ((m = h.match(/^unit-(\d+)$/))) return { view: unit, arg: Number(m[1]), key: h };
  if (h === "about") return { view: about, arg: null, key: h };
  return { view: overview, arg: null, key: "" };
}

// =====================================================================
// 讀資料
// =====================================================================
// refresh：是不是「每 3 分鐘的自動更新」。自動更新時，如果台電還沒有新資料，就不重新下載，節省流量。
async function load({ refresh = false } = {}) {
  const id = ++state.loadId;           // 連續點很快時，只採用最後一次的結果
  const route = parseRoute();
  if (refresh && state.route?.key !== route.key) refresh = false;
  const view = $("#view");
  view.classList.add("stale");         // 讀取中先把舊畫面變淡，不要整個清掉
  try {
    const meta = await getMeta();
    if (!meta.latest) throw new Error("no data");
    if (refresh && state.ctx && meta.latest === state.ctx.meta.latest) return;   // 沒有新資料，畫面不用變
    const range = RANGES[state.range];
    const to = new Date(meta.latest).getTime() + 60e3;   // 包含最新一筆
    const from = to - range.hours * 3600e3;
    const ctx = {
      meta, from, to, bucket: range.bucket,
      fromIso: new Date(from).toISOString(), toIso: new Date(to).toISOString(),
      fromLabel: taipeiIso(from).slice(5).replace("T", " "), toLabel: taipeiIso(to - 60e3).slice(5).replace("T", " "),
    };
    const data = await route.view.load(ctx, route.arg);
    if (id !== state.loadId) return;
    if (data === null) {               // 網址裡的分類或機組不存在
      showBanner(t("notFound"));
      history.replaceState(null, "", location.pathname);
      return load();
    }
    const changedPage = state.route?.key !== route.key;
    Object.assign(state, { route, ctx, data });
    if (!$("#banner").dataset.keep) $("#banner").hidden = true;
    delete $("#banner").dataset.keep;
    render();
    if (changedPage) window.scrollTo(0, 0);
  } catch (err) {
    if (id !== state.loadId) return;
    console.error(err);
    showBanner(`${t("error")}：${err.message}`, true);
  } finally {
    if (id === state.loadId) view.classList.remove("stale");
  }
}

function showBanner(message, withRetry = false) {
  const b = $("#banner");
  b.replaceChildren(el("span", { textContent: message }));
  if (withRetry) b.append(el("button", { type: "button", textContent: t("retry"), onclick: load }));
  else b.dataset.keep = "1";
  b.hidden = false;
}

// =====================================================================
// 畫面
// =====================================================================
function render() {
  document.documentElement.lang = getLang() === "en" ? "en" : "zh-Hant";
  document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = t(e.dataset.t); });
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === getLang()));
  document.querySelectorAll("#ranges button").forEach((b) => {
    b.setAttribute("aria-pressed", b.dataset.range === state.range);
    if (b.disabled) b.title = t("rangeSoon");
  });
  $("#filters").hidden = state.route?.view === about;     // 關於頁不需要時間範圍
  if (!state.ctx) { document.title = t("title"); return; }
  const { meta } = state.ctx;
  $("#asof").textContent = t("asof", `${meta.latest.slice(0, 10)} ${meta.latest.slice(11, 16)}`);
  state.route.view.render($("#view"), state.ctx, state.data);
  const h = $("#view .pagetitle");
  document.title = h ? `${h.firstChild?.nextSibling?.textContent || h.textContent} | ${t("title")}` : t("title");
}

// =====================================================================
// 使用者的操作
// =====================================================================
document.querySelectorAll("[data-lang]").forEach((b) => { b.onclick = () => { setLang(b.dataset.lang); render(); }; });
document.querySelectorAll("#ranges button").forEach((b) => {
  b.onclick = () => { if (!RANGES[b.dataset.range]) return; state.range = b.dataset.range; render(); load(); };
});
window.addEventListener("hashchange", load);
let resizeTimer, lastWidth = innerWidth;
window.addEventListener("resize", () => {
  if (innerWidth === lastWidth) return;          // 手機捲動時網址列伸縮也會觸發 resize，寬度沒變就不重畫
  lastWidth = innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.ctx) render(); }, 150);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (state.ctx) render(); });

// =====================================================================
// 開始
// =====================================================================
render();                                                                   // 先把介面文字放上去
load();                                                                     // 讀第一次資料
setInterval(() => { if (!document.hidden) load({ refresh: true }); }, REFRESH_MS);           // 之後每 3 分鐘檢查一次
document.addEventListener("visibilitychange", () => { if (!document.hidden) load({ refresh: true }); });   // 切回分頁時馬上檢查
