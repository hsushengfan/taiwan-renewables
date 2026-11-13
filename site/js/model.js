// 從 api_meta 的資料裡查東西：分類的顏色、狀態和備註的名稱、各分類最新的合計
import { name, getLang } from "./i18n.js";

// 分類的顏色：[色系編號, 要不要斜線紋路]。同色系的第二個成員（民營、陸域風電）用斜線。
const STYLE = {
  coal: [0, false], ipp_coal: [0, true], gas: [1, false], ipp_gas: [1, true], other_thermal: [2, false],
  storage: [3, false], hydro: [4, false], other_renewable: [5, false], solar: [6, false],
  wind_onshore: [7, true], wind_offshore: [7, false],
};
export const catColorVar = (cat) => `--g${STYLE[cat.code][0]}`;
export const catColor = (cat) => `var(${catColorVar(cat)})`;
export const catHatch = (cat) => STYLE[cat.code][1];

export const categoryByCode = (meta, code) => meta.categories.find((c) => c.code === code);
export const categoryById = (meta, id) => meta.categories.find((c) => c.id === id);
export const unitById = (meta, id) => meta.units.find((u) => u.id === id);

// 狀態名稱，例如 1 → 「正常」
export function statusName(meta, id) {
  const s = meta.statuses.find((x) => x.id === id);
  return s ? name(s) : null;
}

// 備註原文：英文版有翻譯就用翻譯，沒有就顯示中文原文
export const remarkText = (meta, remark) => (getLang() === "en" && meta.remarks[remark]) || remark;

// 每個時間點的說明：有備註就顯示備註原文（例如「合約限制」），沒有備註就顯示狀態（例如「正常」）
export function statusLabels(meta, statuses, remarks = [], noData) {
  return statuses.map((s, i) => (s === 0 ? noData : remarks[i] ? remarkText(meta, remarks[i]) : statusName(meta, s)));
}

// 每個分類「最新一筆」的合計：發電量、有提供容量的機組的裝置容量、機組數
export function latestByCategory(meta) {
  const out = {};
  meta.categories.forEach((c) => { out[c.id] = { now: 0, cap: 0, units: 0, withCap: 0 }; });
  meta.units.forEach((u) => {
    const c = out[u.category_id];
    if (!c) return;
    c.now += u.output_mw || 0;
    c.units += 1;
    if (u.capacity_mw) { c.cap += u.capacity_mw; c.withCap += 1; }
  });
  return out;
}
