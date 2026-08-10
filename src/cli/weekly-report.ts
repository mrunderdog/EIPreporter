import { parseArgs, resolveDatabasePath } from "../config.ts";
import { openDatabase } from "../db.ts";
import { buildWeeklyReport, buildWeeklyReportWithDiscussionActivity, formatWeeklyReport } from "../report.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const databasePath = resolveDatabasePath(args);
  const db = openDatabase(databasePath);

  try {
    const options = {
      trendWindowDays: readDays(args["trend-days"], "--trend-days"),
      changeWindowDays: readDays(args["change-days"], "--change-days"),
    };
    const report = args["no-enrichment"] === true
      ? buildWeeklyReport(db, new Date(), options)
      : await buildWeeklyReportWithDiscussionActivity(db, new Date(), options);
    if (!report) {
      console.log("스냅샷이 없습니다. 먼저 `npm run collect`를 실행하세요.");
      return;
    }
    console.log(args.json === true ? JSON.stringify(report, null, 2) : formatWeeklyReport(report));
  } finally {
    db.close();
  }
}

function readDays(value: string | boolean | undefined, option: string): number | undefined {
  if (value === undefined) return undefined;
  const days = Number(value);
  if (!Number.isInteger(days) || days <= 0) throw new Error(`${option}는 1 이상의 정수여야 합니다.`);
  return days;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
