// =====================================================================
// Edge Function「usage-report」：檢查 Supabase 的用量，需要時寄信
//
// 每天被 pg_cron 呼叫一次（見 supabase/migrations/009_usage_report.sql）。每次做的事：
//   1. 呼叫資料庫的 record_usage()，量一次用量並存起來
//   2. 決定要不要寄信：
//        - 用量第一次超過 70%、85%、95% → 寄警告信（不管今天幾號）
//        - 每月 1 號（台灣時間）→ 寄用量報告
//        - 手動測試時送 {"force": true} → 一定寄用量報告
//   3. 用 Resend 寄信（和新機組通知用同一組設定）
//
// 需要的 Secrets（Edge Functions → Secrets，和 collect 共用，不用再設定）：
//   RESEND_API_KEY、NOTIFY_EMAIL
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL");
const UPGRADE_URL = "https://supabase.com/dashboard";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Usage = {
  db_bytes: number; db_limit_bytes: number;
  storage_bytes: number; storage_limit_bytes: number;
  level: number; prev_level: number;
  db_growth_per_day: number | null; days_until_db_full: number | null;
  readings_rows: number; data_since: string | null;
};

const MB = 1024 * 1024;
const mb = (bytes: number) => (bytes / MB).toFixed(1);
const pct = (a: number, b: number) => ((a / b) * 100).toFixed(1);
const THRESHOLD = ["", "70%", "85%", "95%"];

// 照目前的速度，資料庫大約在哪一天滿
function fullDate(days: number | null): string {
  if (days == null) return "資料還太少，下個月的報告會有估計";
  const d = new Date(Date.now() + days * 86400e3 + 8 * 3600e3).toISOString().slice(0, 10);
  return `大約 ${days} 天後（${d} 左右）`;
}

function buildEmail(u: Usage, warning: boolean): { subject: string; html: string } {
  const dbPct = pct(u.db_bytes, u.db_limit_bytes), stPct = pct(u.storage_bytes, u.storage_limit_bytes);
  const subject = warning
    ? `[台灣電力網站] ⚠️ Supabase 用量已超過 ${THRESHOLD[u.level]}，建議升級`
    : `[台灣電力網站] 每月用量報告：資料庫 ${dbPct}%、Storage ${stPct}%`;
  const row = (label: string, used: number, limit: number) =>
    `<tr><td style="padding:4px 12px 4px 0">${label}</td><td style="padding:4px 12px">${mb(used)} MB / ${mb(limit)} MB</td>` +
    `<td style="padding:4px 0"><b>${pct(used, limit)}%</b></td></tr>`;
  const growth = u.db_growth_per_day == null ? "資料還太少，無法估算" : `每天約 ${mb(u.db_growth_per_day)} MB`;
  const html = `<div style="font-family:sans-serif;font-size:14px;line-height:1.6">
${warning
    ? `<p><b>Supabase 的用量第一次超過 ${THRESHOLD[u.level]}。</b>超過上限後，資料庫可能會被限制成唯讀，<b>新的資料就存不進去了</b>（台電的歷史資料補不回來）。建議盡快升級到 Pro 方案。</p>`
    : `<p>這是每月 1 號的 Supabase 用量報告。</p>`}
<table style="border-collapse:collapse">
${row("資料庫", u.db_bytes, u.db_limit_bytes)}
${row("Storage（原始檔）", u.storage_bytes, u.storage_limit_bytes)}
</table>
<p>資料庫成長速度：${growth}<br>
照目前速度，資料庫會滿：${fullDate(u.days_until_db_full)}<br>
發電紀錄：約 ${u.readings_rows.toLocaleString()} 筆（從 ${u.data_since ? u.data_since.slice(0, 10) : "—"} 開始）</p>
<p>用量超過 70%、85%、95% 時，會另外寄警告信。</p>
<p><b>升級方式</b>：打開 Supabase 網站，選你的 Organization → <b>Billing</b> → 把方案改成 <b>Pro</b>。升級不用搬資料，網站和收集都不會中斷。<br>
<a href="${UPGRADE_URL}">${UPGRADE_URL}</a></p>
<p style="color:#666">上限以 Supabase 免費方案計算（資料庫 500 MB、Storage 1 GB）。升級後要把 record_usage() 的上限改成新方案的數字，請告訴 Claude。</p>
</div>`;
  return { subject, html };
}

async function sendEmail(subject: string, html: string): Promise<string> {
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) return "沒有設定 RESEND_API_KEY 或 NOTIFY_EMAIL，沒有寄信";
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Taiwan Power Site <onboarding@resend.dev>", to: [NOTIFY_EMAIL], subject, html }),
      signal: AbortSignal.timeout(15_000),
    });
    return resp.ok ? `已寄信：${subject}` : `寄信失敗：HTTP ${resp.status} ${(await resp.text()).slice(0, 200)}`;
  } catch (e) {
    return `寄信失敗：${e}`;
  }
}

Deno.serve(async (req) => {
  let force = false;
  try { force = (await req.json())?.force === true; } catch { /* 沒有 body 就當作一般的每日檢查 */ }

  const { data, error } = await supabase.rpc("record_usage");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const usage = data as Usage;

  const warning = usage.level > usage.prev_level;                       // 第一次超過某個門檻
  const firstOfMonth = new Date(Date.now() + 8 * 3600e3).getUTCDate() === 1;   // 台灣時間的 1 號
  let email = "今天不用寄信";
  if (warning || firstOfMonth || force) {
    const { subject, html } = buildEmail(usage, warning);
    email = await sendEmail(subject, html);
  }
  const result = { ok: true, ...usage, email };
  console.log(JSON.stringify(result));
  return Response.json(result);
});
