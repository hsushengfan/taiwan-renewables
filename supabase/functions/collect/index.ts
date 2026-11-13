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
//   5. 收到新的時間點時，檢查有沒有新機組；有的話寄信通知（見下方說明）
//   6. 失敗的話在 collection_runs 記一筆
//
// SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 是 Supabase 自動提供的，不用自己設定。
// HEALTHCHECK_URL 要自己在 Supabase 網站設定（Edge Functions → Secrets），
// 不寫在程式碼裡，因為這個 repo 是公開的：別人拿到這個網址就能假裝報到，讓警報失效。
// RESEND_API_KEY、NOTIFY_EMAIL 也是在 Secrets 設定（新機組通知信用，見 docs/supabase-setup.md）。
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const TAIPOWER_URL =
  "https://service.taipower.com.tw/data/opendata/apply/file/d006001/001.json";
const RETRIES = 2; // 失敗後再試幾次
const SOURCE = "supabase";

const HEALTHCHECK_URL = Deno.env.get("HEALTHCHECK_URL");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL");
const SITE_URL = "https://hsushengfan.github.io/taiwan-renewables/";

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

// ---------------------------------------------------------------------
// 新機組通知
//   台電出現沒看過的機組時，資料庫會自動把它加進 units（並給一個預設分類）。
//   這裡把「還沒通知過」的新機組整理成一封信寄給使用者，
//   寄成功才標記成已通知；寄失敗的話，下一個時間點會再試。
// ---------------------------------------------------------------------
type Notice = {
  id: number; type: string; name: string; category_zh: string | null; needs_category: string | null;
  capacity_mw: number | null; output_mw: number | null; remark: string | null; first_seen_at: string;
};

// 把文字放進 HTML 之前，先把 < > & " 換掉，避免奇怪的名稱破壞信件格式
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function noticeEmail(units: Notice[]): { subject: string; html: string } {
  const decisions = units.filter((u) => u.needs_category);
  const subject = `[台灣電力網站] 發現 ${units.length} 個新機組` + (decisions.length ? "，需要你決定分類" : "");
  const cell = (v: unknown) => `<td style="padding:4px 8px;border-bottom:1px solid #ddd">${esc(v)}</td>`;
  const rows = units.map((u) => `<tr>
    <td style="padding:4px 8px;border-bottom:1px solid #ddd"><a href="${SITE_URL}#unit-${u.id}">${esc(u.name)}</a></td>
    ${cell(u.type)}${cell(u.category_zh ?? "（還沒歸類）")}${cell(u.capacity_mw ?? "—")}${cell(u.output_mw ?? "—")}
    ${cell(u.remark || "—")}${cell(u.first_seen_at.slice(0, 16).replace("T", " "))}</tr>`).join("");
  const asks = [
    ...decisions.map((u) => `<li><b>${esc(u.name)}</b>：${esc(u.needs_category)}</li>`),
    `<li><b>英文名稱</b>：上面 ${units.length} 個機組都還沒有英文名稱，英文版網站暫時顯示中文名稱。</li>`,
  ].join("");
  const html = `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">
<p>台電的資料出現了 ${units.length} 個新機組。系統已經自動把它們加進資料庫，資料也開始收集了。</p>
<table style="border-collapse:collapse"><tr>${["機組", "台電類型", "自動歸類", "裝置容量 (MW)", "目前發電量 (MW)", "備註", "第一次出現"]
  .map((h) => `<th align="left" style="padding:4px 8px;border-bottom:2px solid #999">${h}</th>`).join("")}</tr>${rows}</table>
<h3>需要你決定</h3><ul>${asks}</ul>
<p><b>怎麼處理</b>：把這封信的內容貼給 Claude，告訴它每個機組的英文名稱和分類，Claude 會給你一段 SQL 在 Supabase 執行。</p>
<p style="color:#666">「還沒歸類」的機組，在決定分類之前不會出現在網站的各能源統計裡。</p>
</div>`;
  return { subject, html };
}

async function notifyNewUnits(): Promise<string> {
  const { data, error } = await supabase.rpc("pending_unit_notices");
  if (error) return `檢查新機組失敗：${error.message}`;
  const units = (data ?? []) as Notice[];
  if (!units.length) return "沒有新機組";
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) return `發現 ${units.length} 個新機組，但沒有設定 RESEND_API_KEY 或 NOTIFY_EMAIL，還沒寄信`;

  const { subject, html } = noticeEmail(units);
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Taiwan Power Site <onboarding@resend.dev>", to: [NOTIFY_EMAIL], subject, html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) return `寄信失敗：HTTP ${resp.status} ${(await resp.text()).slice(0, 200)}`;
  } catch (e) {
    return `寄信失敗：${e}`;
  }
  const { error: markError } = await supabase.rpc("mark_units_notified", { ids: units.map((u) => u.id) });
  if (markError) return `信寄出了，但標記已通知失敗：${markError.message}`;
  return `已寄信通知 ${units.length} 個新機組`;
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
    // 新機組只會出現在新的時間點，所以也只在這時候檢查
    const newUnits = data.rows_inserted > 0 ? await notifyNewUnits() : "不是新的時間點，不用檢查";
    const result = { ok: true, ...data, raw: rawNote, healthcheck, newUnits };
    console.log(JSON.stringify(result));
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(message);
    await supabase.rpc("log_collection_failure", { source: SOURCE, message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
