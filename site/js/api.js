// 向 Supabase 讀資料。網站只會呼叫 api_ 開頭的函式（說明見 docs/database.md 第 7 節）。
import { SUPABASE_URL, ANON_KEY } from "./config.js";

async function rpc(name, params = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!resp.ok) {
    let detail = "";
    try { detail = (await resp.json()).message || ""; } catch { /* 不是 JSON 就算了 */ }
    throw new Error(`${name}: HTTP ${resp.status} ${detail}`);
  }
  return resp.json();
}

// 分類、狀態、備註的中英文，全部機組和最新一筆的數字
export const getMeta = () => rpc("api_meta");

// 各分類的發電量與容量因數。bucket: "10min" | "hour" | "day"
export const getCategorySeries = (from, to, bucket) =>
  rpc("api_category_series", { p_from: from, p_to: to, p_bucket: bucket });

// 某個分類底下，每個機組每 10 分鐘的發電量和狀態
export const getUnitSeries = (from, to, categoryId) =>
  rpc("api_unit_series", { p_from: from, p_to: to, p_category_id: categoryId });

// 每日彙總（用來算機組在這段期間的容量因數）
export const getDaily = (fromDay, toDay, categoryId) =>
  rpc("api_daily", { p_from: fromDay, p_to: toDay, p_category_id: categoryId });
