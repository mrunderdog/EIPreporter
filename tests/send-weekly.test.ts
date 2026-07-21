import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  formatWeeklyDeliveryMessage,
  sendWeeklyReport,
} from "../src/cli/send-weekly.ts";
import type { WeeklyRadarReport } from "../src/types.ts";

test("send:weekly sends dashboard text before the HTML document", async () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-send-weekly-"));
  const reportPath = join(directory, "weekly-2026-06-12.html");
  writeFileSync(reportPath, "<!doctype html>", "utf8");
  const calls: string[] = [];

  try {
    const result = await sendWeeklyReport(
      { botToken: "token", chatId: "chat" },
      makeReport(),
      reportPath,
      {
        sendMessage: async (_config, message) => {
          calls.push("message");
          assert.match(message, /^Ethereum Developer Momentum Dashboard/);
          assert.match(message, /Momentum Top 3 themes/);
          assert.match(message, /KGLD Review\/PoC 후보: Review 1건 \/ PoC 1건/);
          assert.match(message, /HTML 파일을 첨부합니다\./);
          assert.doesNotMatch(message, /weekly-2026-06-12\.html/);
          return 1;
        },
        sendDocument: async (_config, filePath, caption) => {
          calls.push("document");
          assert.equal(filePath, reportPath);
          assert.equal(caption, "Ethereum Developer Momentum Dashboard (2026-06-12)");
          return { fileName: "weekly-2026-06-12.html" };
        },
      },
    );

    assert.deepEqual(calls, ["message", "document"]);
    assert.deepEqual(result, {
      messageCount: 1,
      fileName: "weekly-2026-06-12.html",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("send:weekly fails before sending when the HTML report is missing", async () => {
  let sendAttempts = 0;

  await assert.rejects(
    sendWeeklyReport(
      { botToken: "token", chatId: "chat" },
      makeReport(),
      join(tmpdir(), "missing-weekly-report.html"),
      {
        sendMessage: async () => {
          sendAttempts += 1;
          return 1;
        },
      },
    ),
    /HTML report file not found or unreadable: .*missing-weekly-report\.html/,
  );
  assert.equal(sendAttempts, 0);
});

test("send:weekly distinguishes document failure after message success", async () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-send-failure-"));
  const reportPath = join(directory, "weekly-2026-06-12.html");
  writeFileSync(reportPath, "<!doctype html>", "utf8");

  try {
    await assert.rejects(
      sendWeeklyReport(
        { botToken: "token", chatId: "chat" },
        makeReport(),
        reportPath,
        {
          sendMessage: async () => 1,
          sendDocument: async () => {
            throw new Error("Telegram API error 500 Internal Server Error: failed");
          },
        },
      ),
      /Weekly summary sent, but HTML document upload failed: Telegram API error 500/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("send:weekly includes GitHub Actions delivery details", () => {
  const message = formatWeeklyDeliveryMessage(makeReport(), {
    githubActionsRunUrl:
      "https://github.com/kgld/EIPreporter/actions/runs/123456789",
  });

  assert.match(message, /GitHub Actions에서 자동 생성한 Ethereum Developer Momentum Dashboard입니다\./);
  assert.match(message, /Trend window: 180일/);
  assert.match(message, /Change window: 최근 7일 변경사항/);
  assert.match(
    message,
    /https:\/\/github\.com\/kgld\/EIPreporter\/actions\/runs\/123456789/,
  );
  assert.match(message, /HTML 파일은 Telegram document로 첨부합니다\./);
});

test("send:weekly keeps the dashboard summary outside GitHub Actions", () => {
  const message = formatWeeklyDeliveryMessage(makeReport());

  assert.match(message, /^Ethereum Developer Momentum Dashboard/);
  assert.doesNotMatch(message, /GitHub Actions에서 자동 생성/);
});

function makeReport(): WeeklyRadarReport {
  return {
    generatedAt: "2026-06-12T12:00:00.000Z",
    trendPeriod: { from: "", to: "", days: 180 },
    changePeriod: { from: "", to: "", days: 7 },
    ethereumTechRadar: {
      trendProposalCount: 3,
      themeInsights: [
        {
          theme: "Account Abstraction",
          proposalCount: 2,
          proposalCount180d: 2,
          recentChangeCount: 1,
          recentChangeCount7d: 1,
          maturitySignal: "medium",
          momentumScore: 72,
          dominantSubTrends: [{ name: "Paymaster / gas sponsorship", count: 1, description: "설명" }],
          representativeProposals: [],
          trendInterpretation: "해석",
          interpretation: "해석",
        },
      ],
      recentChanges: { total: 1 },
    },
    kgldOpportunityRadar: {
      candidates: [
        { recommendedAction: "review", proposalId: "ERC-1", title: "Review" },
        { recommendedAction: "poc", proposalId: "ERC-2", title: "PoC" },
      ],
    },
  } as unknown as WeeklyRadarReport;
}
