#!/usr/bin/env node
/**
 * 빌드 직전에 production /api/admin/company.php 응답을 가져와
 * app/lib/company-snapshot.json 으로 저장한다.
 *
 * Footer가 이 JSON을 동기 import → SSR/hydration이 동일 값으로 렌더 →
 * hydration mismatch / 텍스트 점프(layout shift) 0.
 *
 * 네트워크 실패 시 기존 JSON을 그대로 두어 빌드가 깨지지 않도록 처리.
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../app/lib/company-snapshot.json");
const SOURCE_URL = process.env.COMPANY_API_URL || "https://thewoollim.com/api/admin/company.php";

const FALLBACK = {
  name: "어울림",
  ceo: "홍길동",
  biz_no: "123-45-67890",
  address: "서울특별시 강남구 테헤란로 123, 4층",
  telecom: "제2026-서울강남-1234호",
};

async function main() {
  let snapshot = FALLBACK;
  // 기존 스냅샷이 있으면 1차 fallback으로 보존
  try {
    const existing = JSON.parse(await readFile(OUT_PATH, "utf-8"));
    if (existing && typeof existing === "object") snapshot = existing;
  } catch {}

  try {
    const res = await fetch(SOURCE_URL, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data?.company && typeof data.company === "object") {
        snapshot = data.company;
      }
    } else {
      console.warn(`[sync-company] HTTP ${res.status} — keeping existing snapshot`);
    }
  } catch (e) {
    console.warn(`[sync-company] fetch failed (${e.message}) — keeping existing snapshot`);
  }

  await writeFile(OUT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
  console.log(`[sync-company] snapshot written: name="${snapshot.name}" ceo="${snapshot.ceo}"`);
}

main().catch(err => {
  console.error("[sync-company] fatal:", err);
  process.exit(0); // 빌드 실패는 막고 기존 스냅샷 유지
});
