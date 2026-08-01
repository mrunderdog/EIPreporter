import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getConfig, parseArgs, resolveDatabasePath } from "../config.ts";
import { openDatabase } from "../db.ts";
import { getGitHubActionsContext } from "../github-actions.ts";
import { writeWeeklyHtmlReport } from "../html-report.ts";
import { buildWeeklyReportWithDiscussionActivity, formatTelegramWeeklySummary } from "../report.ts";
import {
  sendTelegramDocument,
  sendTelegramMessage,
  type TelegramNotifierConfig,
} from "../telegram.ts";
import type { WeeklyRadarReport } from "../types.ts";

type SendWeeklyDependencies = {
  sendMessage?: typeof sendTelegramMessage;
  sendDocument?: typeof sendTelegramDocument;
};

type WeeklyDeliveryContext = {
  githubActionsRunUrl?: string;
};

export async function sendWeeklyReport(
  config: TelegramNotifierConfig,
  report: WeeklyRadarReport,
  htmlReportPath: string,
  dependencies: SendWeeklyDependencies = {},
  deliveryContext: WeeklyDeliveryContext = {},
): Promise<{ messageCount: number; fileName: string }> {
  assertHtmlReportFile(htmlReportPath);
  assertQualityReportPassed(htmlReportPath);

  const sendMessage = dependencies.sendMessage ?? sendTelegramMessage;
  const sendDocument = dependencies.sendDocument ?? sendTelegramDocument;
  const messageCount = await sendMessage(
    config,
    formatWeeklyDeliveryMessage(report, deliveryContext),
  );

  try {
    const document = await sendDocument(
      config,
      htmlReportPath,
      `Ethereum Developer Momentum Dashboard (${report.generatedAt.slice(0, 10)})`,
    );
    return { messageCount, fileName: document.fileName };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Weekly summary sent, but HTML document upload failed: ${detail}`);
  }
}

export async function sendExistingWeeklyReport(
  config: TelegramNotifierConfig,
  htmlReportPath: string,
  dependencies: SendWeeklyDependencies = {},
  deliveryContext: WeeklyDeliveryContext = {},
): Promise<{ messageCount: number; fileName: string }> {
  return sendWeeklyReport(config, reportFromExistingArtifacts(htmlReportPath), htmlReportPath, dependencies, deliveryContext);
}

function assertQualityReportPassed(htmlReportPath: string): void {
  const qualityPath = htmlReportPath.replace(/\.html$/i, ".quality.json");
  if (qualityPath === htmlReportPath || !existsSync(qualityPath)) {
    throw new Error(`Quality report not found for HTML report: ${qualityPath}`);
  }
  const parsed = JSON.parse(readFileSync(qualityPath, "utf8")) as {
    passed?: boolean;
    checks?: Array<{ id?: string; passed?: boolean; severity?: string }>;
  };
  const failedBlockingChecks = (parsed.checks ?? [])
    .filter((check) => check.severity === "fail" && check.passed === false)
    .map((check) => check.id ?? "unknown");
  if (parsed.passed !== true || failedBlockingChecks.length > 0) {
    throw new Error(`Quality gate failed; Telegram delivery blocked. Failed checks: ${failedBlockingChecks.join(", ") || "quality.passed=false"}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = getConfig();
  if (typeof args["report-path"] === "string" && args.existing === true) {
    const htmlReportPath = resolve(args["report-path"]);
    const actionsContext = getGitHubActionsContext();
    const result = await sendExistingWeeklyReport(
      {
        botToken: config.telegramBotToken,
        chatId: config.telegramChatId,
      },
      htmlReportPath,
      {},
      { githubActionsRunUrl: actionsContext?.runUrl },
    );
    console.log(
      `Existing weekly dashboard sent to Telegram (${result.messageCount} message(s), document: ${result.fileName}).`,
    );
    return;
  }
  const databasePath = resolveDatabasePath(args);
  const db = openDatabase(databasePath);

  try {
    const report = await buildWeeklyReportWithDiscussionActivity(db, new Date(), {
      trendWindowDays: readDays(args["trend-days"], "--trend-days"),
      changeWindowDays: readDays(args["change-days"], "--change-days"),
    });
    if (!report) {
      throw new Error("No snapshots found. Run `npm run collect` first.");
    }
    const htmlReportPath = resolveHtmlReportPath(args, report);
    console.log(`HTML report ready: ${htmlReportPath}`);
    const actionsContext = getGitHubActionsContext();

    const result = await sendWeeklyReport(
      {
        botToken: config.telegramBotToken,
        chatId: config.telegramChatId,
      },
      report,
      htmlReportPath,
      {},
      { githubActionsRunUrl: actionsContext?.runUrl },
    );

    console.log(
      `Weekly dashboard sent to Telegram (${result.messageCount} message(s), document: ${result.fileName}).`,
    );
  } finally {
    db.close();
  }
}

function reportFromExistingArtifacts(htmlReportPath: string): WeeklyRadarReport {
  const compactPath = htmlReportPath.replace(/\.html$/i, ".compact.json");
  const qualityPath = htmlReportPath.replace(/\.html$/i, ".quality.json");
  const quality = JSON.parse(readFileSync(qualityPath, "utf8"));
  const compact = JSON.parse(readFileSync(compactPath, "utf8"));
  const snapshot = compact.intelligenceSnapshot;
  const views = snapshot?.views ?? {};
  const generatedAt = snapshot?.metadata?.generatedAt ?? quality.generatedAt ?? new Date(0).toISOString();
  const weeklyTop = views.executivePulse?.weeklyDevelopmentTop3 ?? [];
  const kgldItems = [
    ...(views.kgldWatch?.groups?.research_now ?? []),
    ...(views.kgldWatch?.groups?.monitor ?? []),
  ];
  return {
    generatedAt,
    trendPeriod: { from: "", to: generatedAt, days: 180 },
    changePeriod: { from: "", to: generatedAt, days: 7 },
    ethereumTechRadar: {
      trendProposalCount: snapshot?.monitoringUniverse?.scope?.monitoredProposalCount ?? 0,
      themeInsights: weeklyTop.map((item: { nameKo?: string; topicId?: string; proposalIds?: string[]; rawPostCount?: number }, index: number) => ({
        theme: item.nameKo ?? item.topicId ?? `Signal ${index + 1}`,
        momentumScore: Math.max(1, 90 - index * 10),
        proposalCount180d: item.proposalIds?.length ?? 1,
        recentChangeCount7d: item.rawPostCount ?? 0,
        dominantSubTrends: [],
      })),
      recentChanges: { total: views.dataQuality?.current7dRawEventCount ?? 0 },
      accountAbstractionRadar: { proposalCount: views.accountAbstraction?.summary?.baselineProposalCount ?? 0, trendInterpretation: views.accountAbstraction?.summary?.recentMeaningfulChange ?? "" },
    },
    kgldOpportunityRadar: {
      candidates: kgldItems.map((item: { proposalId?: string; internalAction?: string; actionType?: string }) => ({
        proposalId: item.proposalId,
        title: item.proposalId,
        recommendedAction: item.actionType === "research_now" ? "review" : "monitor",
        oneLineSummary: item.internalAction,
        whyRelevantToKGLD: item.internalAction,
      })),
    },
  } as unknown as WeeklyRadarReport;
}

function resolveHtmlReportPath(
  args: Record<string, string | boolean>,
  report: WeeklyRadarReport,
): string {
  if (args["report-path"] === true) {
    throw new Error("--report-path requires an HTML file path.");
  }
  if (typeof args["report-path"] === "string") {
    return resolve(args["report-path"]);
  }

  const outputDirectory = typeof args.output === "string" ? args.output : "reports";
  const expectedPath = resolve(
    outputDirectory,
    `weekly-${report.generatedAt.slice(0, 10)}.html`,
  );
  if (existsSync(expectedPath)) return expectedPath;

  return writeWeeklyHtmlReport(report, outputDirectory);
}

export function formatWeeklyDeliveryMessage(
  report: WeeklyRadarReport,
  context: WeeklyDeliveryContext = {},
): string {
  const summary = formatTelegramWeeklySummary(report);
  if (!context.githubActionsRunUrl) return summary;

  return [
    "GitHub Actions에서 자동 생성한 Ethereum Developer Momentum Dashboard입니다.",
    `Trend window: ${report.trendPeriod.days}일`,
    `Change window: 최근 ${report.changePeriod.days}일 변경사항`,
    `GitHub Actions run: ${context.githubActionsRunUrl}`,
    "HTML 파일은 Telegram document로 첨부합니다.",
    "",
    summary,
  ].join("\n");
}

function assertHtmlReportFile(filePath: string): void {
  try {
    if (!statSync(filePath).isFile()) {
      throw new Error("path is not a file");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`HTML report file not found or unreadable: ${filePath} (${detail})`);
  }
}

function readDays(value: string | boolean | undefined, option: string): number | undefined {
  if (value === undefined) return undefined;
  const days = Number(value);
  if (!Number.isInteger(days) || days <= 0) throw new Error(`${option} must be a positive integer.`);
  return days;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
