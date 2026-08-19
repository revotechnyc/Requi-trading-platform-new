/**
 * One-time governance vault ingest: seals the confidential source documents
 * into the encrypted vault. Raw documents never enter the repository or any
 * browser-reachable path — only AES-256-GCM ciphertext is stored.
 *
 * Usage: node scripts/gov-ingest.mjs [sourceDir]
 */
import { readFileSync } from "fs";
import { join } from "path";
import { sealDocument } from "../api/governance/vault.ts";

const SOURCE_DIR = process.argv[2] || "/mnt/agents/upload";

const DOCUMENTS = [
  { docKey: "constitution", title: "Institutional Trading Constitution", version: "2.1.0", file: "Institutional_Trading_Constitution_v2.1.0.docx" },
  { docKey: "rti-kernel", title: "RTI Runtime Kernel", version: "3.0", file: "RTI_Runtime_Kernel_v3.0.docx" },
  { docKey: "icos-vol-xvi", title: "ICOS — Volume XVI: Autonomous Decision Authority", version: "2.1.0", file: "ICOS_v2.1.0_Volume_XVI_Autonomous_Decision_Authority.docx" },
  { docKey: "formula-appendix-f", title: "Trading Formula Handbook — Appendix F", version: "2.0+F", file: "Trading_Formula_Handbook_Appendix_F_Signals_vs_Trades.docx" },
  { docKey: "playbook-s1", title: "Strategy Playbook — Supplement S1: Strategy Contract", version: "1.1", file: "Strategy_Playbook_v1.1_Supplement_S1_Strategy_Contract.docx" },
  { docKey: "approved-sources", title: "Requi Approved Public Sources", version: "2.0", file: "Requi_Trading_Approved_Public_Sources_v2.0.docx" },
  { docKey: "strategy-ncpm", title: "Negative Catalyst Put Monitor", version: "1.1", file: "Negative_Catalyst_Put_Monitor_v1.1.docx" },
  { docKey: "strategy-pre-earnings", title: "Pre-Earnings Sentiment Trade", version: "1.1", file: "Pre_Earnings_Sentiment_Trade_v1.1.docx" },
  { docKey: "amendment-ii", title: "Amendment II Implementation Package", version: "2026-07-28", file: "Amendment_II_Implementation_Package.docx" },
];

for (const doc of DOCUMENTS) {
  const plaintext = readFileSync(join(SOURCE_DIR, doc.file));
  const entry = sealDocument(doc.docKey, doc.title, doc.version, plaintext);
  console.log(`sealed ${entry.docKey.padEnd(22)} v${entry.version.padEnd(10)} sha256:${entry.sha256.slice(0, 16)}… (${entry.bytes} bytes)`);
}
console.log("vault sealed — raw sources remain outside the repository");
