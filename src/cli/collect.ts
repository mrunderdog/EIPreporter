import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getConfig, parseArgs, resolveDatabasePath } from "../config.ts";
import { collectProposals } from "../collector.ts";
import { insertSnapshot, openDatabase } from "../db.ts";
import { assertHealthyConfiguredRepositories } from "../source-resolver.ts";
import { buildWeeklyReportWithDiscussionPosts } from "../report.ts";
import { collectVitalikBlogSource } from "../sources/vitalik-blog.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = getConfig();
  const databasePath = resolveDatabasePath(args);
  const trendWindowDays = readDays(args["trend-days"], "--trend-days");
  const changeWindowDays = readDays(args["change-days"], "--change-days");
  const snapshotOut = typeof args["snapshot-out"] === "string" ? resolve(args["snapshot-out"]) : undefined;
  const diagnosticsOut = typeof args["diagnostics-out"] === "string" ? resolve(args["diagnostics-out"]) : undefined;

  console.log("Collecting EIP/ERC proposals...");
  const sourceHealth = assertHealthyConfiguredRepositories();
  const records = await collectProposals(config.githubToken);
  const db = openDatabase(databasePath);

  try {
    const snapshot = insertSnapshot(db, records);
    console.log(`Snapshot ${snapshot.id} saved: ${snapshot.proposalCount} proposals`);
    console.log(`Database: ${databasePath}`);
    if (snapshotOut || diagnosticsOut) {
      const report = await buildWeeklyReportWithDiscussionPosts(db, new Date(), {
        trendWindowDays,
        changeWindowDays,
        limit: readPositiveInteger(args.limit, "--limit") ?? 80,
        timeoutMs: readPositiveInteger(args["timeout-ms"], "--timeout-ms") ?? 5000,
      });
      if (!report) throw new Error("No report snapshot could be built after collection.");
      report.vitalikBlog = await collectVitalikBlogSource(new Date(report.generatedAt));
      const snapshotHash = writeJson(snapshotOut, report);
      const backfill = report.ethereumTechRadar.historicalInputDiagnostics?.gitBackfillDiagnostics;
      writeJson(diagnosticsOut, {
        generatedAt: report.generatedAt,
        databasePath,
        sourceHealth,
        reportSnapshotHash: snapshotHash,
        collection: {
          totalRecords: records.length,
          sourceMode: backfill?.sourceMode ?? "unknown",
          localHistoryRequested: backfill?.localHistoryRequested ?? 0,
          localHistorySucceeded: backfill?.localHistorySucceeded ?? 0,
          localHistoryFailed: backfill?.localHistoryFailed ?? 0,
          apiHistoryRequested: backfill?.apiHistoryRequested ?? 0,
          apiHistorySucceeded: backfill?.apiHistorySucceeded ?? 0,
          apiHistoryFailed: backfill?.apiHistoryFailed ?? 0,
          rateLimitedCount: backfill?.rateLimitedCount ?? 0,
          pathCaseFailures: backfill?.pathCaseFailures ?? 0,
          shallowRepositoryDetected: backfill?.shallowRepositoryDetected ?? 0,
        },
      });
      console.log(`Canonical snapshot: ${snapshotOut ?? "<not requested>"} hash=${snapshotHash ?? "<not written>"}`);
      console.log(`Collection diagnostics: ${diagnosticsOut ?? "<not requested>"}`);
    }
  } finally {
    db.close();
  }
}

function writeJson(path: string | undefined, value: unknown): string | undefined {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  const hash = createHash("sha256").update(json).digest("hex");
  if (!path) return hash;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, json, "utf8");
  return hash;
}

function readDays(value: string | boolean | undefined, option: string): number | undefined {
  if (value === undefined) return undefined;
  const days = Number(value);
  if (!Number.isInteger(days) || days <= 0) throw new Error(`${option} must be a positive integer.`);
  return days;
}

function readPositiveInteger(value: string | boolean | undefined, option: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${option} must be a positive integer.`);
  return parsed;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
