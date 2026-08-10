import { getConfig, parseArgs, resolveDatabasePath } from "../config.ts";
import { detectEmergingAlerts, formatEmergingTelegramAlert, buildEmergingLayerWithSources } from "../emerging.ts";
import { openDatabase } from "../db.ts";
import { collectProposals } from "../collector.ts";
import { getChangeEventsSince, insertSnapshot } from "../db.ts";
import { sendTelegramMessage } from "../telegram.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = getConfig();
  const db = openDatabase(resolveDatabasePath(args));
  const now = readDate(args["generated-at"], "--generated-at") ?? new Date();
  const reportUrl = typeof args["report-url"] === "string" ? args["report-url"] : process.env.EIPREPORTER_REPORT_URL;

  try {
    const records = await collectProposals(config.githubToken);
    insertSnapshot(db, records);
    const recentEvents = getChangeEventsSince(
      db,
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      now.toISOString(),
    );
    const layer = await buildEmergingLayerWithSources({
      db,
      now,
      records,
      recentEvents,
      githubToken: config.githubToken,
      timeoutMs: readPositiveInteger(args["timeout-ms"], "--timeout-ms") ?? 8000,
      limit: readPositiveInteger(args.limit, "--limit") ?? 60,
    });
    const alerts = detectEmergingAlerts(db, layer, now);
    console.log(JSON.stringify({
      generatedAt: layer.generatedAt,
      rawSignals: layer.rawSignals.length,
      issues: layer.issues.length,
      alerts: alerts.map((issue) => ({ issueId: issue.issueId, status: issue.status, heatScore: issue.heatScore })),
      sourceStatus: layer.sourceStatus.map((status) => ({ sourceName: status.sourceName, result: status.result, recordCountCollected: status.recordCountCollected })),
    }, null, 2));

    if (alerts.length && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID && args["no-telegram"] !== true) {
      for (const issue of alerts.slice(0, 3)) {
        await sendTelegramMessage(
          { botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID },
          formatEmergingTelegramAlert(issue, reportUrl),
        );
      }
    }
  } finally {
    db.close();
  }
}

function readPositiveInteger(value: string | boolean | undefined, option: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${option} must be a positive integer.`);
  return parsed;
}

function readDate(value: string | boolean | undefined, option: string): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${option} value must be an ISO-8601 timestamp.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${option} value must be an ISO-8601 timestamp.`);
  return parsed;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
