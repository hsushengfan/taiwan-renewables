// =====================================================================
// Edge Function「collect」：抓一次台電即時資料，存進 Supabase
//
// 會被 pg_cron 每 3 分鐘呼叫一次。每次做的事：
//   1. 抓台電 JSON（失敗會再試 2 次）
//   2. 交給資料庫的 ingest_snapshot() 整理並存進 readings
//      （整理規則只寫在資料庫裡，見 supabase/migrations/001_schema.sql）
//   3. 原始 JSON 壓縮後存到 Storage 的 raw/2026-11-10/1140.json.gz
//      （和以前 data/raw 的路徑一樣；已經存過就略過）
//   4. 收到新的時間點時，向 Healthchecks.io 報到（警報用，見下方說明）
//   5. 失敗的話在 collection_runs 記一筆
//
// SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 是 Supabase 自動提供的，不用自己設定。
// HEALTHCHECK_URL 要自己在 Supabase 網站設定（Edge Functions → Secrets），
// 不寫在程式碼裡，因為這個 repo 是公開的：別人拿到這個網址就能假裝報到，讓警報失效。
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const TAIPOWER_URL =
  "https://service.taipower.com.tw/data/opendata/apply/file/d006001/001.json";
const RETRIES = 2; // 失敗後再試幾次
const SOURCE = "supabase";

const HEALTHCHECK_URL = Deno.env.get("HEALTHCHECK_URL");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// 抓台電資料。台電的檔案開頭有一個看不見的 BOM 字元，要先去掉才能解析 JSON。
async function fetchTaipower(): Promise<{ DateTime: string; aaData: unknown[] }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 5000 * attempt)); // 等 5 秒、10 秒再試
    try {
      const resp = await fetch(TAIPOWER_URL, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!resp.ok) throw new Error(`台電回應 HTTP ${resp.status}`);
      const text = (await resp.text()).replace(/^﻿/, "");
      return JSON.parse(text);
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`抓台電資料失敗（試了 ${RETRIES + 1} 次）：${lastError}`);
}

// "2026-11-10T11:40:00" → "2026-11-10/1140.json.gz"
function rawPath(dateTime: string): string {
  const [day, time] = dateTime.split("T");
  return `${day}/${time.slice(0, 2)}${time.slice(3, 5)}.json.gz`;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// 原始檔存到 Storage。回傳一段說明文字（成功、已存在、或失敗原因）。
// 存原始檔失敗不算整次失敗：最重要的是資料庫有存到。
async function saveRaw(raw: { DateTime: string }): Promise<string> {
  const path = rawPath(raw.DateTime);
  const body = await gzip(JSON.stringify(raw));
  const { error } = await supabase.storage.from("raw").upload(path, body, {
    contentType: "application/gzip",
    upsert: false,
  });
  if (!error) return `原始檔已存 ${path}`;
  if (/exists|duplicate/i.test(error.message)) return "原始檔之前已存過";
  return `原始檔存檔失敗：${error.message}`;
}

// 向 Healthchecks.io 報到：「又收到一筆新資料了」。
// Healthchecks.io 那邊設定成「超過 40 分鐘沒報到就寄信」，所以只要收集停了
// （不管是程式壞了、Supabase 被暫停、還是台電沒更新），都會收到通知。
// 報到失敗不算整次失敗：最重要的是資料庫有存到。
async function pingHealthcheck(message: string): Promise<string> {
  if (!HEALTHCHECK_URL) return "沒有設定 HEALTHCHECK_URL，略過報到";
  try {
    const resp = await fetch(HEALTHCHECK_URL, {
      method: "POST",
      body: message,
      signal: AbortSignal.timeout(10_000),
    });
    return resp.ok ? "已向 Healthchecks.io 報到" : `報到失敗：HTTP ${resp.status}`;
  } catch (e) {
    return `報到失敗：${e}`;
  }
}

Deno.serve(async () => {
  try {
    const raw = await fetchTaipower();

    const { data, error } = await supabase.rpc("ingest_snapshot", { raw, source: SOURCE });
    if (error) throw new Error(`寫入資料庫失敗：${error.message}`);

    const rawNote = await saveRaw(raw);
    // 只有收到「新的」時間點才報到；同一個時間點重複抓到（rows_inserted 是 0）不算
    const healthcheck = data.rows_inserted > 0
      ? await pingHealthcheck(`${data.data_time} 新增 ${data.rows_inserted} 列`)
      : "不是新的時間點，不用報到";
    const result = { ok: true, ...data, raw: rawNote, healthcheck };
    console.log(JSON.stringify(result));
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(message);
    await supabase.rpc("log_collection_failure", { source: SOURCE, message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
