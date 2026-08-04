import { readFileSync } from "node:fs";
import { parseArgs } from "../config.ts";
import { validateWeeklyCollectionPreflight } from "../html-report.ts";
import type { WeeklyRadarReport } from "../types.ts";

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.snapshot !== "string") {
    throw new Error("--snapshot is required.");
  }
  const report = JSON.parse(readFileSync(args.snapshot, "utf8")) as WeeklyRadarReport;
  validateWeeklyCollectionPreflight(report);
  const backfill = report.ethereumTechRadar.historicalInputDiagnostics?.gitBackfillDiagnostics;
  console.log(`sourceMode=${backfill?.sourceMode ?? "unknown"}`);
  console.log(`localHistoryRequested=${backfill?.localHistoryRequested ?? 0}`);
  console.log(`localHistorySucceeded=${backfill?.localHistorySucceeded ?? 0}`);
  console.log(`apiHistoryRequested=${backfill?.apiHistoryRequested ?? 0}`);
  console.log(`rateLimitedCount=${backfill?.rateLimitedCount ?? 0}`);
  console.log("Collection preflight passed.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

