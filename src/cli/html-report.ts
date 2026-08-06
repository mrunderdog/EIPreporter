import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs, resolveDatabasePath } from "../config.ts";
import { openDatabase } from "../db.ts";
import { validateWeeklyCollectionPreflight, writeWeeklyHtmlReport } from "../html-report.ts";
import { buildWeeklyReport, buildWeeklyReportWithDiscussionActivity, buildWeeklyReportWithDiscussionPosts } from "../report.ts";
import { collectVitalikBlogSource } from "../sources/vitalik-blog.ts";
import type { WeeklyRadarReport } from "../types.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outputDirectory = typeof args.output === "string" ? args.output : "reports";
  if (typeof args.snapshot === "string") {
    const snapshotText = readFileSync(args.snapshot, "utf8");
    const inputSnapshotHash = createHash("sha256").update(snapshotText).digest("hex");
    const report = JSON.parse(snapshotText) as WeeklyRadarReport;
    if (args["skip-preflight"] !== true) validateWeeklyCollectionPreflight(report);
    const outputPath = writeWeeklyHtmlReport(report, outputDirectory, { debug: args.debug === true });
    console.log(`Render source: canonical snapshot`);
    console.log(`networkRequests=0`);
    console.log(`inputSnapshotHash=${inputSnapshotHash}`);
    console.log(`output=${outputPath}`);
    return;
  }
  const databasePath = resolveDatabasePath(args);
  const db = openDatabase(databasePath);

  try {
    const options = {
      trendWindowDays: readDays(args["trend-days"], "--trend-days"),
      changeWindowDays: readDays(args["change-days"], "--change-days"),
      limit: readPositiveInteger(args.limit, "--limit") ?? 240,
      timeoutMs: readPositiveInteger(args["timeout-ms"], "--timeout-ms") ?? 5000,
      cacheTtlHours: readPositiveInteger(args["cache-ttl-hours"], "--cache-ttl-hours"),
    };
    const generatedAt = readDate(args["generated-at"], "--generated-at") ?? new Date();
    const report = args["full-enrichment"] === true
      ? await buildWeeklyReportWithDiscussionActivity(db, generatedAt, options)
      : args["no-discussion-fetch"] === true
        ? buildWeeklyReport(db, generatedAt, options)
        : await buildWeeklyReportWithDiscussionPosts(db, generatedAt, options);
    if (!report) {
      throw new Error("스냅샷이 없습니다. 먼저 `npm run collect`를 실행하세요.");
    }
    report.vitalikBlog = await collectVitalikBlogSource(generatedAt);
    if (args["skip-preflight"] !== true) validateWeeklyCollectionPreflight(report);
    console.log(writeWeeklyHtmlReport(report, outputDirectory, { debug: args.debug === true }));
  } finally {
    db.close();
  }
}

function readDays(value: string | boolean | undefined, option: string): number | undefined {
  if (value === undefined) return undefined;
  const days = Number(value);
  if (!Number.isInteger(days) || days <= 0) throw new Error(`${option} 값은 1 이상의 정수여야 합니다.`);
  return days;
}

function readPositiveInteger(value: string | boolean | undefined, option: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${option} value must be a positive integer.`);
  return parsed;
}

function readDate(value: string | boolean | undefined, option: string): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${option} value must be an ISO-8601 timestamp.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${option} value must be an ISO-8601 timestamp.`);
  return parsed;
}

main().then(() => {
  process.exit(0);
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
