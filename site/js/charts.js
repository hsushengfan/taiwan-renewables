// 各頁面共用的圖表
//
//   stackedChart()  總覽頁：各能源堆疊面積圖
//   areaChart()     能源類型頁、機組頁：單一條發電量曲線，加上「裝置容量」參考線，
//                   機組頁另外在圖的下方畫一條和時間軸對齊的狀態色帶
//   sparkline()     表格裡的小趨勢線
//   statusStrip()   表格裡的小狀態色帶
//
// 橫軸都照「真實時間」排列：沒有資料的時段留白，不會把前後的資料接在一起。

import { el, svgEl, cssVar, fmt, hhmm, mmdd, taipeiIso } from "./util.js";
import { t } from "./i18n.js";

const BUCKET_MS = { "10min": 600e3, hour: 3600e3, day: 86400e3 };
const H = 340;                                   // 圖的高度
const M = { l: 48, r: 12, t: 10, b: 26 };        // 四邊留白

// 狀態的顏色（對應 statuses.id；0 是那個時間點沒有資料）
export const STATUS_COLOR = {
  0: "--st-none", 1: "--st-good", 2: "--st-vol", 3: "--st-warn",
  4: "--st-crit", 5: "--st-none", 6: "--st-none", 7: "--st-serious",
};

// ---------------------------------------------------------------------
// 共用：建立圖的外框（svg + 提示框），並算好時間軸
// ---------------------------------------------------------------------
function setup(container, { times, from, extraBottom = 0 }) {
  container.classList.add("chart");
  const svg = svgEl("svg", { role: "img" });
  const tip = el("div", { className: "tip", hidden: true });
  container.replaceChildren(svg, tip);
  const W = container.clientWidth || 800, height = H + extraBottom;
  svg.setAttribute("viewBox", `0 0 ${W} ${height}`);
  svg.style.height = height + "px";

  const ms = times.map((iso) => new Date(iso).getTime());
  const t0 = from, t1 = Math.max(ms[ms.length - 1] || from + 1, from + 1);
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const xt = (time) => M.l + ((time - t0) / (t1 - t0)) * iw;
  return { svg, tip, W, iw, ih, ms, t0, t1, xt, x: (i) => xt(ms[i]) };
}

// 縱軸：算出好讀的刻度（0、5,000、10,000…），畫橫向格線
//   small：數字很小時（例如電價 0～5 元、轉供費率 0～1 元）也用 0.1、0.2、0.5 這種刻度
function yAxis(g, min, max, { small = false } = {}) {
  const span = small ? Math.max(max - min, 0.01) : Math.max(max - min, 1);
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  const step = steps.filter((s) => small || s >= 1).find((s) => span / s <= 6) || 10000;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step || step;
  const y = (v) => M.t + g.ih - ((v - lo) / (hi - lo)) * g.ih;
  for (let n = 0, v = lo; v <= hi + step / 2; n++, v = lo + n * step) {
    g.svg.append(svgEl("line", { x1: M.l, x2: g.W - M.r, y1: y(v), y2: y(v), stroke: cssVar(Math.abs(v) < step / 2 ? "--axis" : "--grid"), "stroke-width": 1 }));
    const label = svgEl("text", { x: M.l - 8, y: y(v) + 4, "text-anchor": "end" });
    label.textContent = Math.abs(hi) >= 10000 ? v / 1000 + "K" : Number(v.toFixed(4)).toLocaleString();
    g.svg.append(label);
  }
  return y;
}

// 橫軸：36 小時以內每 3 小時標「時:分」，更長的範圍在每天 00:00 標「月-日」
function xAxis(g, labelY) {
  const longRange = g.t1 - g.t0 > 36 * 3600e3;
  let lastX = -Infinity;
  for (let time = Math.ceil(g.t0 / 3600e3) * 3600e3; time <= g.t1; time += 3600e3) {
    const iso = taipeiIso(time), hour = Number(iso.slice(11, 13));
    if (longRange ? hour !== 0 : hour % 3 !== 0) continue;
    const px = g.xt(time);
    if (px - lastX < 56 || px > g.W - M.r - 16 || px < M.l + 4) continue;
    const label = svgEl("text", { x: px, y: labelY, "text-anchor": "middle" });
    label.textContent = longRange ? mmdd(iso) : hhmm(iso);
    g.svg.append(label);
    lastX = px;
  }
  return longRange;
}

// 把資料切成「連續的區段」：兩筆之間隔超過 1.5 個間隔就斷開
function segments(ms, bucket) {
  const gap = BUCKET_MS[bucket] * 1.5, out = [];
  for (let i = 0, start = 0; i <= ms.length; i++) {
    if (i === ms.length || (i > 0 && ms[i] - ms[i - 1] > gap)) { out.push([start, i - 1]); start = i; }
  }
  return out;
}

// 一塊面積：上緣是 upper、下緣是 lower，每個連續區段畫一塊
function areaPath(g, y, upper, lower, segs) {
  const pt = (arr, i) => `${g.x(i).toFixed(1)},${y(arr[i]).toFixed(1)}`;
  return segs.filter(([a, b]) => b > a).map(([a, b]) => {
    const up = [], down = [];
    for (let i = a; i <= b; i++) { up.push(pt(upper, i)); down.unshift(pt(lower, i)); }
    return "M" + up.join("L") + "L" + down.join("L") + "Z";
  }).join("");
}

// 斜線紋路（民營電廠、陸域風電用）
function hatchPattern(g, id, color) {
  let defs = g.svg.querySelector("defs");
  if (!defs) { defs = svgEl("defs"); g.svg.prepend(defs); }
  const p = svgEl("pattern", { id, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  p.append(svgEl("rect", { width: 6, height: 6, fill: color }), svgEl("rect", { width: 2, height: 6, fill: cssVar("--surface") }));
  defs.append(p);
  return `url(#${id})`;
}

// 滑鼠移動時：找最近的時間點，畫一條直線，顯示提示框
function crosshair(g, times, rowsAt) {
  const cross = svgEl("line", { y1: M.t, y2: M.t + g.ih, stroke: cssVar("--ink2"), "stroke-width": 1, visibility: "hidden" });
  g.svg.append(cross);
  const show = (clientX) => {
    const rect = g.svg.getBoundingClientRect();
    const time = g.t0 + ((clientX - rect.left - M.l) / g.iw) * (g.t1 - g.t0);
    let i = 0;
    for (let k = 1; k < g.ms.length; k++) if (Math.abs(g.ms[k] - time) < Math.abs(g.ms[i] - time)) i = k;
    cross.setAttribute("x1", g.x(i)); cross.setAttribute("x2", g.x(i)); cross.setAttribute("visibility", "visible");
    g.tip.replaceChildren(el("div", { className: "t", textContent: `${times[i].slice(0, 10)} ${hhmm(times[i])}` }));
    rowsAt(i).forEach(([label, value, color, isTotal]) => {
      const left = el("span");
      if (color) { const k = el("i", { className: "k" }); k.style.background = color; left.append(k); }
      left.append(document.createTextNode(label));
      g.tip.append(el("div", { className: "r" + (isTotal ? " tot" : "") }, [left, el("b", { textContent: value })]));
    });
    g.tip.hidden = false;
    const w = g.tip.offsetWidth, left = g.x(i) + 12 + w > g.W ? g.x(i) - 12 - w : g.x(i) + 12;
    g.tip.style.left = Math.max(0, left) + "px";
  };
  const hide = () => { g.tip.hidden = true; cross.setAttribute("visibility", "hidden"); };
  g.svg.addEventListener("pointermove", (e) => show(e.clientX));
  g.svg.addEventListener("pointerdown", (e) => show(e.clientX));
  g.svg.addEventListener("pointerleave", hide);
}

// ---------------------------------------------------------------------
// 堆疊面積圖（總覽頁）
//   layers：由下往上的每一層 { label, color, hatch, values }
// ---------------------------------------------------------------------
export function stackedChart(container, { times, bucket, from, layers }) {
  const g = setup(container, { times, from });
  g.svg.setAttribute("aria-label", t("chartTitle"));
  if (!times.length) return;
  const val = (layer, i) => Math.max(0, layer.values[i] || 0);
  const totals = times.map((_, i) => layers.reduce((s, l) => s + val(l, i), 0));
  const y = yAxis(g, 0, Math.max(...totals, 1));
  const longRange = xAxis(g, H - 8);
  const segs = segments(g.ms, bucket);

  const base = new Array(times.length).fill(0);
  layers.forEach((layer, n) => {
    const lower = base.slice();
    times.forEach((_, i) => { base[i] += val(layer, i); });
    const d = areaPath(g, y, base, lower, segs);
    if (!d) return;
    g.svg.append(svgEl("path", {
      d, fill: layer.hatch ? hatchPattern(g, "h" + n, layer.color) : layer.color,
      stroke: cssVar("--surface"), "stroke-width": longRange ? 0.75 : 1.5, "stroke-linejoin": "round",
    }));
  });

  crosshair(g, times, (i) => [
    ...[...layers].reverse().map((l) => [l.label, fmt(val(l, i)), l.color]),
    [t("total"), fmt(totals[i]) + " MW", null, true],
  ]);
}

// ---------------------------------------------------------------------
// 單一條發電量曲線（能源類型頁、機組頁）
//   capacity：裝置容量，畫成一條水平參考線（沒有就不畫）
//   tipRows(i)：提示框裡除了發電量之外，還要顯示的列
//   band：機組頁的狀態色帶 { statuses, labels }，畫在圖的下方、和時間軸對齊
// ---------------------------------------------------------------------
export function areaChart(container, { times, bucket, from, values, color, hatch, label, capacity, tipRows, band }) {
  const BAND = band ? 34 : 0;
  const g = setup(container, { times, from, extraBottom: BAND });
  g.svg.setAttribute("aria-label", label);
  if (!times.length) return;
  const vals = values.map((v) => (v == null ? null : v));
  const nums = vals.filter((v) => v != null);
  const y = yAxis(g, Math.min(0, ...nums), Math.max(capacity || 0, ...nums, 1));
  xAxis(g, H - 8);
  const segs = segments(g.ms, bucket);

  // 面積：從 0 到發電量
  const zero = vals.map(() => 0), filled = vals.map((v) => v || 0);
  const d = areaPath(g, y, filled, zero, segs);
  if (d) g.svg.append(svgEl("path", { d, fill: hatch ? hatchPattern(g, "ha", color) : color, "fill-opacity": hatch ? 0.35 : 0.18 }));
  // 線：發電量
  segs.filter(([a, b]) => b > a).forEach(([a, b]) => {
    const pts = [];
    for (let i = a; i <= b; i++) pts.push(`${g.x(i).toFixed(1)},${y(filled[i]).toFixed(1)}`);
    g.svg.append(svgEl("polyline", { points: pts.join(" "), fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round" }));
  });

  // 裝置容量的參考線
  if (capacity) {
    g.svg.append(svgEl("line", { x1: M.l, x2: g.W - M.r, y1: y(capacity), y2: y(capacity), stroke: cssVar("--ink2"), "stroke-width": 1, "stroke-dasharray": "4 3" }));
    const lab = svgEl("text", { x: g.W - M.r, y: y(capacity) - 5, "text-anchor": "end", class: "ref" });
    lab.textContent = `${t("capacityLine")} ${fmt(capacity, 1)} MW`;
    g.svg.append(lab);
  }

  // 狀態色帶：每個資料點畫成一小段，寬度是一個間隔
  if (band) {
    const top = H + 4, w = (g.iw * BUCKET_MS[bucket]) / (g.t1 - g.t0);
    const caption = svgEl("text", { x: M.l - 8, y: top + 14, "text-anchor": "end" });
    caption.textContent = t("colStatus");
    g.svg.append(caption);
    for (let i = 0; i < times.length;) {
      let j = i;
      while (j < times.length && band.statuses[j] === band.statuses[i] && band.labels[j] === band.labels[i] && (j === i || g.ms[j] - g.ms[j - 1] <= BUCKET_MS[bucket] * 1.5)) j++;
      const x0 = g.x(i), x1 = Math.min(g.x(j - 1) + w, g.W - M.r);
      const rect = svgEl("rect", { x: x0, y: top, width: Math.max(x1 - x0, 1), height: 20, fill: cssVar(STATUS_COLOR[band.statuses[i]] || "--st-none") });
      const title = svgEl("title");
      title.textContent = `${mmdd(times[i])} ${hhmm(times[i])} – ${mmdd(times[j - 1])} ${hhmm(times[j - 1])}　${band.labels[i]}`;
      rect.append(title);
      g.svg.append(rect);
      i = j;
    }
  }

  crosshair(g, times, (i) => [[label, vals[i] == null ? "—" : fmt(vals[i], 1) + " MW", color], ...(tipRows ? tipRows(i) : [])]);
}

// ---------------------------------------------------------------------
// 表格用的小圖
// ---------------------------------------------------------------------

// 小趨勢線：高度的上限是裝置容量（沒有容量就用期間最大值）
export function sparkline(values, cap) {
  const svg = svgEl("svg", { class: "spark", viewBox: "0 0 96 22", "aria-hidden": "true" });
  const n = values.length;
  if (n < 2) return svg;
  const vals = values.map((v) => Math.max(0, v || 0)), max = Math.max(cap || 0, ...vals, 0.001);
  svg.append(svgEl("polyline", {
    points: vals.map((v, i) => `${((i / (n - 1)) * 94 + 1).toFixed(1)},${(20 - (v / max) * 18).toFixed(1)}`).join(" "),
    fill: "none", stroke: cssVar("--ink2"), "stroke-width": 1.5, "stroke-linejoin": "round",
  }));
  return svg;
}

// 小狀態色帶：連續相同的狀態（而且說明相同）畫成一段
//   labels[i]：第 i 個時間點的說明文字（有備註就是備註原文，沒有就是狀態名稱）
export function statusStrip(statuses, labels, times) {
  const n = statuses.length;
  const svg = svgEl("svg", { class: "strip", viewBox: `0 0 ${Math.max(n, 1)} 1`, preserveAspectRatio: "none", role: "img" });
  const counts = {};
  for (let i = 0; i < n;) {
    let j = i;
    while (j < n && statuses[j] === statuses[i] && labels[j] === labels[i]) j++;
    const rect = svgEl("rect", { x: i, y: 0, width: j - i, height: 1, fill: cssVar(STATUS_COLOR[statuses[i]] || "--st-none") });
    const title = svgEl("title");
    title.textContent = `${mmdd(times[i])} ${hhmm(times[i])} – ${mmdd(times[j - 1])} ${hhmm(times[j - 1])}　${labels[i]}`;
    rect.append(title);
    svg.append(rect);
    counts[labels[i]] = (counts[labels[i]] || 0) + (j - i);
    i = j;
  }
  svg.setAttribute("aria-label", Object.entries(counts).map(([l, c]) => `${l} ${Math.round((c / n) * 100)}%`).join(", "));
  return svg;
}

// =====================================================================
// 以「年」為橫軸的圖（電價走勢頁、轉供費率頁）
// =====================================================================

// 共用：外框和橫軸。xs 是年份陣列，例如 [2002, 2003, …, 2026]
function setupYears(container, xs, { band = false } = {}) {
  container.classList.add("chart");
  const svg = svgEl("svg", { role: "img" });
  const tip = el("div", { className: "tip", hidden: true });
  container.replaceChildren(svg, tip);
  const W = container.clientWidth || 800;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.style.height = H + "px";
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  // band：長條圖，每一年佔一格、長條畫在格子中間；折線圖則是第一年在最左、最後一年在最右
  const slot = band ? iw / xs.length : iw / Math.max(xs.length - 1, 1);
  const x = (i) => M.l + (band ? (i + 0.5) * slot : i * slot);
  // 年份標籤：太擠的時候每 2 年或每 5 年標一次
  const every = [1, 2, 5, 10].find((n) => slot * n >= 34) || 10;
  xs.forEach((yr, i) => {
    if (yr % every !== 0 && !(every === 1)) return;
    // 最右邊的標籤靠右對齊，才不會被切掉一半
    const atEdge = x(i) > W - M.r - 14;
    const label = svgEl("text", { x: atEdge ? W - 2 : x(i), y: H - 8, "text-anchor": atEdge ? "end" : "middle" });
    label.textContent = String(yr);
    svg.append(label);
  });
  return { svg, tip, W, iw, ih, x, slot };
}

// 年度的提示框：滑鼠在哪一年，就顯示那一年的數字
function yearHover(g, xs, rowsAt) {
  const cross = svgEl("line", { y1: M.t, y2: M.t + g.ih, stroke: cssVar("--ink2"), "stroke-width": 1, visibility: "hidden" });
  g.svg.append(cross);
  const show = (clientX) => {
    const rect = g.svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * g.W;
    let i = 0;
    for (let k = 1; k < xs.length; k++) if (Math.abs(g.x(k) - px) < Math.abs(g.x(i) - px)) i = k;
    cross.setAttribute("x1", g.x(i)); cross.setAttribute("x2", g.x(i)); cross.setAttribute("visibility", "visible");
    g.tip.replaceChildren(el("div", { className: "t", textContent: String(xs[i]) }));
    rowsAt(i).forEach(([label, value, color, dashed]) => {
      const left = el("span");
      const k = el("i", { className: "k" + (dashed ? " dashed" : "") });
      if (color) { k.style.background = color; left.append(k); }
      left.append(document.createTextNode(label));
      g.tip.append(el("div", { className: "r" }, [left, el("b", { textContent: value })]));
    });
    g.tip.hidden = false;
    const scale = rect.width / g.W, w = g.tip.offsetWidth;
    const left = g.x(i) * scale + 12 + w > rect.width ? g.x(i) * scale - 12 - w : g.x(i) * scale + 12;
    g.tip.style.left = Math.max(0, left) + "px";
  };
  const hide = () => { g.tip.hidden = true; cross.setAttribute("visibility", "hidden"); };
  g.svg.addEventListener("pointermove", (e) => show(e.clientX));
  g.svg.addEventListener("pointerdown", (e) => show(e.clientX));
  g.svg.addEventListener("pointerleave", hide);
}

// ---------------------------------------------------------------------
// 年度折線圖
//   series：[{ label, color, values（和 xs 對齊，沒有資料是 null）, dashed（虛線）,
//              hollow（Set，哪幾個點畫成空心）, format(值, 第幾年) → 提示框裡的文字 }]
//   縱軸從 0 開始，才不會誇大變化。
// ---------------------------------------------------------------------
export function lineChart(container, { xs, series, label }) {
  const g = setupYears(container, xs);
  g.svg.setAttribute("aria-label", label);
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  const y = yAxis(g, 0, Math.max(...all, 0.01), { small: true });
  const surface = cssVar("--surface");

  series.forEach((s) => {
    // 線：連續有資料的年份連起來
    let pts = [];
    const flush = () => {
      if (pts.length > 1) g.svg.append(svgEl("polyline", {
        points: pts.join(" "), fill: "none", stroke: s.color, "stroke-width": 2,
        "stroke-linejoin": "round", "stroke-linecap": "round", ...(s.dashed ? { "stroke-dasharray": "6 4" } : {}),
      }));
      pts = [];
    };
    s.values.forEach((v, i) => { if (v == null) flush(); else pts.push(`${g.x(i).toFixed(1)},${y(v).toFixed(1)}`); });
    flush();
    // 點：每一年一個，空心點代表還不是完整一年的數字
    s.values.forEach((v, i) => {
      if (v == null) return;
      const hollow = s.hollow?.has(i);
      g.svg.append(svgEl("circle", {
        cx: g.x(i), cy: y(v), r: hollow ? 4.5 : 3,
        fill: hollow ? surface : s.color, stroke: hollow ? s.color : surface, "stroke-width": hollow ? 2 : 1.5,
      }));
    });
  });

  yearHover(g, xs, (i) => series.filter((s) => s.values[i] != null)
    .map((s) => [s.label, s.format(s.values[i], i), s.color, s.dashed]));
}

// ---------------------------------------------------------------------
// 堆疊長條圖（轉供費率頁）
//   layers：由下往上 [{ label, color, values }]；totals：長條頂端標的合計（和 xs 對齊）
//   format(值) → 提示框和頂端標籤的文字
// ---------------------------------------------------------------------
export function stackedBars(container, { xs, layers, totals, label, format }) {
  const g = setupYears(container, xs, { band: true });
  g.svg.setAttribute("aria-label", label);
  const y = yAxis(g, 0, Math.max(...totals.filter((v) => v != null), 0.01) * 1.12, { small: true });
  const bw = Math.min(28, g.slot * 0.6);
  xs.forEach((_, i) => {
    let base = 0;
    layers.forEach((l, n) => {
      const v = l.values[i];
      if (v == null) return;
      const top = base + v, last = n === layers.length - 1;
      g.svg.append(svgEl("rect", {
        x: g.x(i) - bw / 2, y: y(top), width: bw, height: Math.max(y(base) - y(top) - (last ? 0 : 1), 0.5),
        fill: l.color, rx: last ? 2 : 0,
      }));
      base = top;
    });
    if (totals[i] != null) {
      const t = svgEl("text", { x: g.x(i), y: y(totals[i]) - 6, "text-anchor": "middle", class: "barlabel" });
      t.textContent = format(totals[i]);
      g.svg.append(t);
    }
  });
  yearHover(g, xs, (i) => [...layers].reverse().filter((l) => l.values[i] != null)
    .map((l) => [l.label, format(l.values[i]), l.color])
    .concat(totals[i] != null ? [[t("total"), format(totals[i]), null]] : []));
}

// ---------------------------------------------------------------------
// 調價時間軸
//   events：[{ date: "2015-04-01", kind: "increase" | "decrease" | "freeze" | "deferred", title }]
//   有調整（漲、降）的畫在上排，沒調整（不調整、延後）的畫在下排，點才不會擠在一起。
//   形狀和顏色都不同（▲ 調漲、▼ 調降、● 不調整、◆ 延後），不會只靠顏色區分。
//   lanes：上下兩排的名稱；onSelect(第幾個)：點了某個標記
// ---------------------------------------------------------------------
export const DECISION_STYLE = {
  increase: { shape: "up", color: "--st-crit" },
  decrease: { shape: "down", color: "--g4" },
  freeze: { shape: "dot", color: "--muted" },
  deferred: { shape: "diamond", color: "--st-warn" },
  none: { shape: "ring", color: "--muted" },   // 那一年沒有調價（2017），空心圓
};

export function markerSvg(kind, size = 12) {
  const svg = svgEl("svg", { width: size, height: size, viewBox: "-6 -6 12 12", "aria-hidden": "true", class: "marker" });
  svg.append(markerShape(kind));
  return svg;
}

function markerShape(kind, r = 5) {
  const { shape, color } = DECISION_STYLE[kind];
  const fill = cssVar(color);
  if (shape === "up") return svgEl("path", { d: `M0 ${-r} L${r} ${r * 0.8} L${-r} ${r * 0.8} Z`, fill });
  if (shape === "down") return svgEl("path", { d: `M0 ${r} L${r} ${-r * 0.8} L${-r} ${-r * 0.8} Z`, fill });
  if (shape === "diamond") return svgEl("path", { d: `M0 ${-r} L${r} 0 L0 ${r} L${-r} 0 Z`, fill });
  if (shape === "ring") return svgEl("circle", { r: r * 0.7, fill: "none", stroke: fill, "stroke-width": 1.5 });
  return svgEl("circle", { r: r * 0.8, fill });
}

export function timelineChart(container, { events, startYear, endYear, lanes, selected, onSelect }) {
  container.classList.add("timeline");
  const W = container.clientWidth || 800, TH = 112, L = 76, R = 16;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${TH}`, role: "group" });
  svg.style.height = TH + "px";
  container.replaceChildren(svg);
  const t0 = Date.UTC(startYear, 0, 1), t1 = Date.UTC(endYear + 1, 0, 1);
  const x = (iso) => L + ((Date.parse(iso) - t0) / (t1 - t0)) * (W - L - R);
  const laneY = [30, 66], axisY = 92;

  // 兩排的名稱和橫線
  lanes.forEach((name, n) => {
    const tx = svgEl("text", { x: 0, y: laneY[n] + 4, class: "lane" });
    tx.textContent = name;
    svg.append(tx, svgEl("line", { x1: L, x2: W - R, y1: laneY[n], y2: laneY[n], stroke: cssVar("--grid"), "stroke-width": 1 }));
  });
  // 年份刻度
  const perYear = (W - L - R) / (endYear - startYear + 1);
  const every = perYear >= 34 ? 1 : perYear >= 17 ? 2 : 5;
  svg.append(svgEl("line", { x1: L, x2: W - R, y1: axisY, y2: axisY, stroke: cssVar("--axis"), "stroke-width": 1 }));
  for (let yr = startYear; yr <= endYear + 1; yr++) {
    const px = x(`${yr}-01-01`);
    svg.append(svgEl("line", { x1: px, x2: px, y1: axisY, y2: axisY + 4, stroke: cssVar("--axis"), "stroke-width": 1 }));
    if (yr <= endYear && (yr - startYear) % every === 0) {
      const label = svgEl("text", { x: x(`${yr}-07-01`), y: axisY + 16, "text-anchor": "middle" });
      label.textContent = String(yr);
      svg.append(label);
    }
  }
  // 標記：每一個都可以點，也可以用鍵盤（Tab 移過去、Enter 選取）
  // 可以點的範圍最大是半徑 11 像素，但不會超過和同一排鄰居距離的一半，
  // 手機上標記很擠時，才不會點到隔壁那一個。
  const lane = (ev) => (ev.kind === "increase" || ev.kind === "decrease" ? 0 : 1);
  const hitR = events.map((ev, i) => {
    let gap = Infinity;
    events.forEach((o, j) => { if (j !== i && lane(o) === lane(ev)) gap = Math.min(gap, Math.abs(x(o.date) - x(ev.date))); });
    return Math.max(4, Math.min(11, gap / 2));
  });
  events.forEach((ev, i) => {
    const changed = lane(ev) === 0;
    const gx = svgEl("g", { transform: `translate(${x(ev.date).toFixed(1)},${laneY[changed ? 0 : 1]})`, tabindex: 0, role: "button", class: "tl-mark" });
    gx.setAttribute("aria-label", ev.title);
    gx.setAttribute("aria-pressed", i === selected);
    const title = svgEl("title");
    title.textContent = ev.title;
    if (i === selected) gx.append(svgEl("circle", { r: 10, fill: "none", stroke: cssVar("--ink"), "stroke-width": 1.5 }));
    gx.append(svgEl("rect", { x: -hitR[i], y: -14, width: hitR[i] * 2, height: 28, fill: "transparent" }), markerShape(ev.kind, 6), title);
    gx.addEventListener("click", () => onSelect(i));
    gx.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(i); } });
    svg.append(gx);
  });
}
