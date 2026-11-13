// 首頁的主程式：讀資料 → 算出要顯示的數字 → 畫到畫面上。
//
// 流程：
//   load()   向 Supabase 讀資料，整理後存進 state
//   render() 依照 state 畫出整個畫面（換語言、換範圍、點分類時都會重畫）
// 每 3 分鐘自動 load() 一次，所以開著網頁資料會自己更新。

import { REFRESH_MS } from "./config.js";
import { getMeta, getCategorySeries, getUnitSeries, getDaily } from "./api.js";
import { t, name, getLang, setLang, locale } from "./i18n.js";

// ---- 分類的顏色。同色系的第二個成員用斜線紋路（hatch）----
const STYLE = {
  coal: [0, false], ipp_coal: [0, true], gas: [1, false], ipp_gas: [1, true], other_thermal: [2, false],
  storage: [3, false], hydro: [4, false], other_renewable: [5, false], solar: [6, false],
  wind_onshore: [7, true], wind_offshore: [7, false],
};
// ---- 狀態的顏色（對應 statuses.id；0 是那個時間點沒有資料）----
const STATUS_COLOR = { 0: "--st-none", 1: "--st-good", 2: "--st-vol", 3: "--st-warn", 4: "--st-crit", 5: "--st-none", 6: "--st-none", 7: "--st-serious" };

// ---- 時間範圍：往回看幾小時、用哪種粒度 ----
const RANGES = { "24h": { hours: 24, bucket: "10min" }, "7d": { hours: 24 * 7, bucket: "10min" } };

const state = {
  range: "24h",
  selected: null,        // 目前選到的分類編號
  hidden: new Set(),     // 圖上被隱藏的分類
  sortKey: "now", sortDir: -1,
  meta: null, series: null, unitSeries: null, daily: null,
};

// ---- 小工具 ----
const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, kids = []) => { const e = document.createElement(tag); Object.assign(e, props); kids.forEach((k) => e.append(k)); return e; };
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? "—" : v.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v) => (v == null || Number.isNaN(v) ? "—" : (v * 100).toFixed(1) + "%");
const mean = (arr) => { const xs = arr.filter((v) => v != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
// 資料庫給的時間長這樣："2026-11-13T11:20:00+08:00"。直接切字串，就一定是台灣時間。
const hhmm = (iso) => iso.slice(11, 16);
const mmdd = (iso) => iso.slice(5, 10);
const catColor = (cat) => `var(--g${STYLE[cat.code][0]})`;
const catHatch = (cat) => STYLE[cat.code][1];

// =====================================================================
// 讀資料
// =====================================================================
async function load() {
  $("#chart").classList.add("stale");   // 讀取中先把舊圖變淡，不要整個清掉
  try {
    const meta = await getMeta();
    if (!meta.latest) throw new Error("no data");
    const range = RANGES[state.range];
    const to = new Date(new Date(meta.latest).getTime() + 60 * 1000);   // 包含最新一筆
    const from = new Date(to.getTime() - range.hours * 3600 * 1000);
    if (state.selected == null) state.selected = meta.categories.find((c) => c.code === "wind_offshore").id;

    const [series, unitSeries, daily] = await Promise.all([
      getCategorySeries(from.toISOString(), to.toISOString(), range.bucket),
      getUnitSeries(from.toISOString(), to.toISOString(), state.selected),
      getDaily(taipeiDay(from), taipeiDay(to), state.selected),
    ]);
    Object.assign(state, { meta, series, unitSeries, daily, from: from.getTime(), to: to.getTime() });
    $("#banner").hidden = true;
    render();
  } catch (err) {
    console.error(err);
    showError(err);
  } finally {
    $("#chart").classList.remove("stale");
  }
}

// 把時間換成台灣的日期，例如 "2026-11-13"
function taipeiDay(date) {
  return new Date(date.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function showError(err) {
  const b = $("#banner");
  b.replaceChildren(
    el("span", { textContent: `${t("error")}：${err.message}` }),
    el("button", { type: "button", textContent: t("retry"), onclick: load }));
  b.hidden = false;
}

// =====================================================================
// 畫面
// =====================================================================
function render() {
  document.documentElement.lang = getLang() === "en" ? "en" : "zh-Hant";
  document.title = t("title");
  document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = t(e.dataset.t); });
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === getLang()));
  document.querySelectorAll("#ranges button").forEach((b) => {
    b.setAttribute("aria-pressed", b.dataset.range === state.range);
    if (b.disabled) b.title = t("rangeSoon");
  });
  if (!state.meta) return;

  const { meta, series } = state;
  $("#asof").textContent = t("asof", `${meta.latest.slice(0, 10)} ${hhmm(meta.latest)}`);
  $("#chartsub").textContent = t("chartSub", t(series.bucket === "10min" ? "bucket10" : series.bucket === "hour" ? "bucketHour" : "bucketDay"));

  renderStats();
  renderLegend();
  renderChart();
  renderCategories();
  renderUnits();
  renderStatusKey();
}

// 每個分類「最新一筆」的發電量：直接把 api_meta 裡各機組的最新數字加起來
function latestByCategory() {
  const out = {};
  state.meta.categories.forEach((c) => { out[c.id] = { now: 0, cap: 0, units: 0 }; });
  state.meta.units.forEach((u) => {
    const c = out[u.category_id]; if (!c) return;
    c.now += Math.max(0, u.output_mw || 0); c.cap += u.capacity_mw || 0; c.units += 1;
  });
  return out;
}

function renderStats() {
  const { meta, series } = state;
  const latest = latestByCategory();
  const byCode = Object.fromEntries(meta.categories.map((c) => [c.code, latest[c.id].now]));
  const total = Object.values(latest).reduce((s, c) => s + c.now, 0);
  const renewable = meta.categories.filter((c) => c.is_renewable).reduce((s, c) => s + latest[c.id].now, 0);
  const solarId = meta.categories.find((c) => c.code === "solar").id;
  const solarPeak = Math.max(0, ...(series.series[solarId]?.output || []).map((v) => v || 0));
  const items = [
    [t("statTotal"), fmt(total), "MW", t("statTotalNote", meta.units.length)],
    [t("statRenewable"), total ? (renewable / total * 100).toFixed(1) : "—", "%", t("statRenewableNote", fmt(renewable))],
    [t("statWind"), fmt(byCode.wind_offshore + byCode.wind_onshore), "MW", t("statWindNote", fmt(byCode.wind_offshore), fmt(byCode.wind_onshore))],
    [t("statSolar"), fmt(byCode.solar), "MW", byCode.solar < 1 ? t("statSolarNight") : t("statSolarPeak", fmt(solarPeak))],
  ];
  $("#stats").replaceChildren(...items.map(([l, v, u, n]) => el("div", { className: "stat" }, [
    el("div", { className: "l", textContent: l }),
    el("div", { className: "v" }, [document.createTextNode(v), el("small", { textContent: u })]),
    el("div", { className: "n", textContent: n })])));
}

function renderLegend() {
  const box = $("#legend");
  box.setAttribute("aria-label", t("legendLabel"));
  // 圖例的順序和堆疊圖一樣：最上層的排最前面
  box.replaceChildren(...[...state.meta.categories].reverse().map((cat) => {
    const sw = el("i", { className: catHatch(cat) ? "hatch" : "" });
    sw.style.backgroundColor = catColor(cat);
    const b = el("button", { className: "chip", type: "button" }, [sw, document.createTextNode(name(cat))]);
    b.setAttribute("aria-pressed", !state.hidden.has(cat.id));
    b.onclick = () => {
      state.hidden.has(cat.id) ? state.hidden.delete(cat.id) : state.hidden.add(cat.id);
      if (state.hidden.size === state.meta.categories.length) state.hidden.delete(cat.id);   // 至少留一個
      renderLegend(); renderChart();
    };
    return b;
  }));
}

// ---- 堆疊面積圖 ----
// 橫軸照「真實時間」排列：沒有資料的時段會留白，不會把前後的資料接在一起。
let geo = null;   // 記住圖的尺寸，滑鼠移動時算位置用
const BUCKET_MS = { "10min": 600e3, hour: 3600e3, day: 86400e3 };
// 把毫秒換成台灣時間的字串，例如 "2026-11-13T11:20"
const taipeiIso = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 16);

function renderChart() {
  const { meta, series } = state;
  const svg = $("#svg"), W = svg.clientWidth || 800, H = 340, m = { l: 44, r: 12, t: 10, b: 26 };
  const N = series.times.length;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("aria-label", t("chartTitle"));
  svg.replaceChildren();
  if (!N) { geo = null; return; }

  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const ms = series.times.map((iso) => new Date(iso).getTime());
  const t0 = state.from, t1 = Math.max(ms[N - 1], t0 + 1);
  const cats = meta.categories.filter((c) => !state.hidden.has(c.id));
  const val = (cat, i) => Math.max(0, series.series[cat.id]?.output[i] || 0);
  const totals = series.times.map((_, i) => cats.reduce((s, c) => s + val(c, i), 0));
  const max = Math.max(...totals, 1);
  const step = [50, 100, 200, 500, 1000, 2000, 5000, 10000].find((s) => max / s <= 6) || 10000;
  const top = Math.ceil(max / step) * step;
  const xt = (time) => m.l + ((time - t0) / (t1 - t0)) * iw, x = (i) => xt(ms[i]), y = (v) => m.t + ih - (v / top) * ih;
  const surface = cssVar("--surface");

  // 斜線紋路的定義
  const defs = svgEl("defs"); svg.append(defs);
  cats.filter(catHatch).forEach((cat) => {
    const p = svgEl("pattern", { id: "h" + cat.id, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    p.append(svgEl("rect", { width: 6, height: 6, fill: cssVar("--g" + STYLE[cat.code][0]) }), svgEl("rect", { width: 2, height: 6, fill: surface }));
    defs.append(p);
  });

  // 橫向格線和 Y 軸的數字
  for (let v = 0; v <= top; v += step) {
    svg.append(svgEl("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: cssVar(v ? "--grid" : "--axis"), "stroke-width": 1 }));
    const label = svgEl("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" });
    label.textContent = top >= 10000 ? v / 1000 + "K" : v.toLocaleString();
    svg.append(label);
  }

  // X 軸的標籤：36 小時以內每 3 小時標「時:分」，更長的範圍在每天 00:00 標「月-日」
  const longRange = t1 - t0 > 36 * 3600e3;
  let lastX = -Infinity;
  for (let time = Math.ceil(t0 / 3600e3) * 3600e3; time <= t1; time += 3600e3) {
    const iso = taipeiIso(time), hour = Number(iso.slice(11, 13));
    if (longRange ? hour !== 0 : hour % 3 !== 0) continue;
    const px = xt(time);
    if (px - lastX < 56 || px > W - m.r - 16 || px < m.l + 4) continue;
    const label = svgEl("text", { x: px, y: H - 8, "text-anchor": "middle" });
    label.textContent = longRange ? mmdd(iso) : hhmm(iso);
    svg.append(label); lastX = px;
  }

  // 把資料切成「連續的區段」：兩筆之間隔太久（超過 1.5 個間隔）就斷開
  const gap = BUCKET_MS[series.bucket] * 1.5, segments = [];
  for (let i = 0, start = 0; i <= N; i++) {
    if (i === N || (i > 0 && ms[i] - ms[i - 1] > gap)) { segments.push([start, i - 1]); start = i; }
  }

  // 一層一層往上疊
  const base = new Array(N).fill(0);
  cats.forEach((cat) => {
    const lower = base.slice();
    for (let i = 0; i < N; i++) base[i] += val(cat, i);
    const pt = (arr, i) => `${x(i).toFixed(1)},${y(arr[i]).toFixed(1)}`;
    const d = segments.filter(([a, b]) => b > a).map(([a, b]) => {
      const up = [], down = [];
      for (let i = a; i <= b; i++) { up.push(pt(base, i)); down.unshift(pt(lower, i)); }
      return "M" + up.join("L") + "L" + down.join("L") + "Z";
    }).join("");
    if (!d) return;
    svg.append(svgEl("path", {
      d, fill: catHatch(cat) ? `url(#h${cat.id})` : cssVar("--g" + STYLE[cat.code][0]),
      stroke: surface, "stroke-width": longRange ? 0.75 : 1.5, "stroke-linejoin": "round",
    }));
  });

  const cross = svgEl("line", { y1: m.t, y2: m.t + ih, stroke: cssVar("--ink2"), "stroke-width": 1, visibility: "hidden" });
  svg.append(cross);
  geo = { x, m, iw, W, N, ms, t0, t1, cross, totals, cats, val };
}

function showTip(clientX) {
  if (!geo) return;
  const rect = $("#svg").getBoundingClientRect();
  // 找出離滑鼠最近的那個時間點
  const time = geo.t0 + ((clientX - rect.left - geo.m.l) / geo.iw) * (geo.t1 - geo.t0);
  let i = 0;
  for (let k = 1; k < geo.N; k++) if (Math.abs(geo.ms[k] - time) < Math.abs(geo.ms[i] - time)) i = k;
  geo.cross.setAttribute("x1", geo.x(i)); geo.cross.setAttribute("x2", geo.x(i)); geo.cross.setAttribute("visibility", "visible");
  const iso = state.series.times[i], tip = $("#tip");
  tip.replaceChildren(el("div", { className: "t", textContent: `${iso.slice(0, 10)} ${hhmm(iso)}` }));
  [...geo.cats].reverse().forEach((cat) => {
    const key = el("i", { className: "k" }); key.style.background = catColor(cat);
    tip.append(el("div", { className: "r" }, [el("span", {}, [key, document.createTextNode(name(cat))]), el("b", { textContent: fmt(geo.val(cat, i)) })]));
  });
  tip.append(el("div", { className: "r tot" }, [el("span", { textContent: t("total") }), el("b", { textContent: fmt(geo.totals[i]) + " MW" })]));
  tip.hidden = false;
  const w = tip.offsetWidth, left = geo.x(i) + 12 + w > geo.W ? geo.x(i) - 12 - w : geo.x(i) + 12;
  tip.style.left = Math.max(0, left) + "px";
}
function hideTip() { $("#tip").hidden = true; if (geo) geo.cross.setAttribute("visibility", "hidden"); }

// ---- 能源類型表 ----
function renderCategories() {
  const { meta, series } = state;
  const latest = latestByCategory();
  const total = Object.values(latest).reduce((s, c) => s + c.now, 0);
  // 每個時間點代表幾小時：10 分鐘 = 1/6 小時
  const hoursPerPoint = series.bucket === "10min" ? 1 / 6 : series.bucket === "hour" ? 1 : 24;
  const rows = [...meta.categories].sort((a, b) => latest[b.id].now - latest[a.id].now).map((cat) => {
    const s = series.series[cat.id] || { output: [], cf: [] }, L = latest[cat.id];
    const share = total ? L.now / total : 0;
    const energyMwh = s.output.reduce((sum, v) => sum + (v || 0), 0) * hoursPerPoint;
    const sw = el("i", { className: "sw" + (catHatch(cat) ? " hatch" : "") }); sw.style.backgroundColor = catColor(cat);
    const bar = el("i", { className: "bar" }); bar.style.width = Math.max(2, share * 120) + "px"; bar.style.background = catColor(cat);
    const tr = el("tr", { tabIndex: 0, className: cat.id === state.selected ? "sel" : "" }, [
      el("td", {}, [sw, document.createTextNode(name(cat))]),
      el("td", { textContent: fmt(L.now) }),
      el("td", { className: "c" }, [bar, document.createTextNode((share * 100).toFixed(1) + "%")]),
      el("td", { textContent: fmt(L.cap) }),
      el("td", { textContent: fmt(energyMwh / t("energyUnit")) }),
      el("td", { textContent: pct(mean(s.cf)) }),
      el("td", { textContent: L.units }),
    ]);
    const pick = async () => {
      state.selected = cat.id; renderCategories();
      await load();
      $("#unitcard").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    tr.onclick = pick;
    tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } };
    return tr;
  });
  $("#cats tbody").replaceChildren(...rows);
}

// ---- 機組表 ----
function renderUnits() {
  const { meta, unitSeries, daily } = state;
  const cat = meta.categories.find((c) => c.id === state.selected);
  $("#unittitle").textContent = t("unitTitle", name(cat));

  // 期間容量因數：把每日的容量因數依「當天有幾個時間點」加權平均
  const cfByUnit = {};
  daily.forEach((d) => {
    if (d.capacity_factor == null) return;
    const c = (cfByUnit[d.unit_id] ||= { sum: 0, n: 0 });
    c.sum += d.capacity_factor * d.intervals_present; c.n += d.intervals_present;
  });

  const rows = meta.units.filter((u) => u.category_id === state.selected).map((u) => ({
    u, name: name(u), cap: u.capacity_mw, now: u.output_mw,
    cf: cfByUnit[u.id] ? cfByUnit[u.id].sum / cfByUnit[u.id].n : null,
    s: unitSeries.units[u.id] || { output: [], status: [], remark: [] },
  }));
  const k = state.sortKey;
  rows.sort((a, b) => {
    if (a[k] == null && b[k] == null) return 0;
    if (a[k] == null) return 1;
    if (b[k] == null) return -1;
    return (typeof a[k] === "string" ? a[k].localeCompare(b[k], locale()) : a[k] - b[k]) * state.sortDir;
  });

  $("#units tbody").replaceChildren(...rows.map((r) => {
    const remark = r.u.remark ? remarkText(r.u.remark) : "—";
    return el("tr", {}, [
      el("td", { textContent: r.name }),
      el("td", { textContent: fmt(r.cap, 1), className: r.cap == null ? "dim" : "" }),
      el("td", { textContent: fmt(r.now, 1) }),
      el("td", { textContent: pct(r.cf), className: r.cf == null ? "dim" : "" }),
      el("td", { className: "c" }, [sparkline(r.s.output, r.cap)]),
      el("td", { className: "c" }, [statusStrip(r.s.status, r.s.remark || [], unitSeries.times)]),
      el("td", { className: "c", textContent: remark }),
    ]);
  }));
  document.querySelectorAll("#units th.sortable").forEach((th) => {
    th.setAttribute("aria-sort", th.dataset.k === k ? (state.sortDir < 0 ? "descending" : "ascending") : "none");
  });
}

// 小趨勢線：高度的上限是裝置容量（沒有容量就用期間最大值）
function sparkline(values, cap) {
  const svg = svgEl("svg", { class: "spark", viewBox: "0 0 96 22" });
  const n = values.length; if (n < 2) return svg;
  const vals = values.map((v) => Math.max(0, v || 0)), max = Math.max(cap || 0, ...vals, 0.001);
  svg.append(svgEl("polyline", {
    points: vals.map((v, i) => `${((i / (n - 1)) * 94 + 1).toFixed(1)},${(20 - (v / max) * 18).toFixed(1)}`).join(" "),
    fill: "none", stroke: cssVar("--ink2"), "stroke-width": 1.5, "stroke-linejoin": "round",
  }));
  return svg;
}

// 備註原文：英文版有翻譯就用翻譯，沒有就顯示中文原文
function remarkText(remark) {
  return (getLang() === "en" && state.meta.remarks[remark]) || remark;
}

// 狀態色帶：連續相同的狀態（而且備註相同）畫成一段。
// 滑鼠移上去：有備註就顯示備註原文（例如「合約限制」），沒有備註就顯示狀態（例如「正常」）。
function statusStrip(statuses, remarks, times) {
  const n = statuses.length, svg = svgEl("svg", { class: "strip", viewBox: `0 0 ${Math.max(n, 1)} 1`, preserveAspectRatio: "none", role: "img" });
  const statusName = (id) => { const s = state.meta.statuses.find((x) => x.id === id); return s ? name(s) : t("noData"); };
  const label = (i) => (statuses[i] !== 0 && remarks[i] ? remarkText(remarks[i]) : statusName(statuses[i]));
  const counts = {};
  for (let i = 0; i < n;) {
    let j = i; while (j < n && statuses[j] === statuses[i] && (remarks[j] || "") === (remarks[i] || "")) j++;
    const rect = svgEl("rect", { x: i, y: 0, width: j - i, height: 1, fill: cssVar(STATUS_COLOR[statuses[i]] || "--st-none") });
    const title = svgEl("title");
    title.textContent = `${mmdd(times[i])} ${hhmm(times[i])} – ${mmdd(times[j - 1])} ${hhmm(times[j - 1])}　${label(i)}`;
    rect.append(title); svg.append(rect);
    counts[label(i)] = (counts[label(i)] || 0) + (j - i);
    i = j;
  }
  svg.setAttribute("aria-label", Object.entries(counts).map(([l, c]) => `${l} ${Math.round((c / n) * 100)}%`).join(", "));
  return svg;
}

function renderStatusKey() {
  const items = state.meta.statuses.filter((s) => s.id !== 5).map((s) => {
    const sw = el("i"); sw.style.background = `var(${STATUS_COLOR[s.id]})`;
    const unknown = state.meta.statuses.find((x) => x.id === 5);
    return el("span", {}, [sw, document.createTextNode(s.id === 6 ? `${name(s)} / ${name(unknown)}` : name(s))]);
  });
  $("#statuskey").replaceChildren(...items);
}

// =====================================================================
// 使用者的操作
// =====================================================================
document.querySelectorAll("[data-lang]").forEach((b) => { b.onclick = () => { setLang(b.dataset.lang); render(); }; });
document.querySelectorAll("#ranges button").forEach((b) => { b.onclick = () => { if (!RANGES[b.dataset.range]) return; state.range = b.dataset.range; render(); load(); }; });
document.querySelectorAll("#units th.sortable").forEach((th) => {
  th.tabIndex = 0;
  const go = () => {
    if (state.sortKey === th.dataset.k) state.sortDir = -state.sortDir;
    else { state.sortKey = th.dataset.k; state.sortDir = th.dataset.k === "name" ? 1 : -1; }
    renderUnits();
  };
  th.onclick = go; th.onkeydown = (e) => { if (e.key === "Enter") go(); };
});
const chartSvg = $("#svg");
chartSvg.addEventListener("pointermove", (e) => showTip(e.clientX));
chartSvg.addEventListener("pointerdown", (e) => showTip(e.clientX));
chartSvg.addEventListener("pointerleave", hideTip);
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { hideTip(); if (state.meta) renderChart(); }, 100); });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (state.meta) render(); });

// =====================================================================
// 開始
// =====================================================================
render();                       // 先把介面文字放上去
load();                         // 讀第一次資料
setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);            // 之後每 3 分鐘更新
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });   // 切回分頁時馬上更新
