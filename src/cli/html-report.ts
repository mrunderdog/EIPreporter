import { parseArgs, resolveDatabasePath } from "../config.ts";
import { openDatabase } from "../db.ts";
import { writeWeeklyHtmlReport } from "../html-report.ts";
import { buildWeeklyReportWithDiscussionActivity } from "../report.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const databasePath = resolveDatabasePath(args);
  const outputDirectory = typeof args.output === "string" ? args.output : "reports";
  const db = openDatabase(databasePath);

  try {
    const report = await buildWeeklyReportWithDiscussionActivity(db, new Date(), {
      trendWindowDays: readDays(args["trend-days"], "--trend-days"),
      changeWindowDays: readDays(args["change-days"], "--change-days"),
    });
    if (!report) {
      throw new Error("스냅샷이 없습니다. 먼저 `npm run collect`를 실행하세요.");
    }
    console.log(writeWeeklyHtmlReport(report, outputDirectory));
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
