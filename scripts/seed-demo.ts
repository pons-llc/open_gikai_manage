/**
 * デモデータ投入スクリプト。委員会・定例会・2期分の議員・会派・議題(公開/予約混在)・
 * 同日チェーン日程・資料・賛否記録(委員会採決→本会議採決の2段階含む)・お知らせを一通り投入する。
 *
 * 使い方:
 *   npm run seed-demo               # ローカル D1/R2 に投入(既存の業務データは削除される)
 *   npm run seed-demo -- --remote   # 本番 D1/R2 に投入(要確認。誤爆防止のため引数を明示させている)
 *
 * scripts/seed-demo.sql を DELETE + INSERT で適用したのち、資料の実体を R2 にアップロードする。
 * agenda_types(議案/報告/認定)と admin_users/admin_sessions はリセットしない。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DB_NAME = "open-gikai";
const BUCKET_NAME = "open-gikai-documents";
const SQL_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed-demo.sql");

const DEMO_DOCUMENTS: { key: string; fileName: string; body: string }[] = [
  {
    key: "documents/2026/seed-demo-r7-budget.txt",
    fileName: "令和7年度一般会計予算説明資料.txt",
    body: "令和7年度一般会計予算の説明資料(デモデータ)。\n歳入歳出それぞれの概要をここに記載します。",
  },
  {
    key: "documents/2026/seed-demo-r8-suppl-budget.txt",
    fileName: "令和8年度一般会計補正予算(第2号)説明資料.txt",
    body: "令和8年度一般会計補正予算(第2号)の説明資料(デモデータ)。\n主な補正内容をここに記載します。",
  },
  {
    key: "documents/2026/seed-demo-petition.txt",
    fileName: "子育て支援施設整備請願書.txt",
    body: "子育て支援施設整備に関する請願書(デモデータ)。\n請願の趣旨・理由をここに記載します。",
  },
  {
    key: "documents/2026/seed-demo-agenda.txt",
    fileName: "次第.txt",
    body: "本会議次第(デモデータ)。\n1. 開会 2. 議案上程 3. 質疑 4. 閉会",
  },
  {
    key: "documents/2026/seed-demo-minutes.txt",
    fileName: "会議録.txt",
    body: "本会議会議録(デモデータ)。\n審議の経過・採決結果をここに記載します。",
  },
];

function parseArgs(argv: string[]): { remote: boolean } {
  return { remote: argv.includes("--remote") };
}

async function main() {
  const { remote } = parseArgs(process.argv.slice(2));
  const target = remote ? "--remote" : "--local";

  if (remote) {
    console.log("[remote] 本番 D1/R2 にデモデータを投入します。既存の業務データは削除されます。");
  } else {
    console.log("[local] ローカル D1/R2 にデモデータを投入します。既存の業務データは削除されます。");
  }

  console.log("1/2: D1 にスキーマデータを投入中...");
  execFileSync("npx", ["wrangler", "d1", "execute", DB_NAME, target, "--file", SQL_FILE], { stdio: "inherit" });

  console.log("2/2: R2 に資料の実体をアップロード中...");
  const tmpDir = mkdtempSync(path.join(tmpdir(), "seed-demo-"));
  for (const doc of DEMO_DOCUMENTS) {
    const tmpFile = path.join(tmpDir, path.basename(doc.key));
    writeFileSync(tmpFile, doc.body, "utf-8");
    execFileSync(
      "npx",
      ["wrangler", "r2", "object", "put", `${BUCKET_NAME}/${doc.key}`, target, "--file", tmpFile, "--content-type", "text/plain"],
      { stdio: "inherit" }
    );
    console.log(`  - ${doc.fileName} -> ${doc.key}`);
  }

  console.log("完了しました。管理画面(/admin)・公開画面(/)で確認できます。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
