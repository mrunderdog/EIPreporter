import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { insertSnapshot, openDatabase } from "../src/db.ts";
import { generateWeeklyHtml, writeWeeklyHtmlReport } from "../src/html-report.ts";
import { buildWeeklyReport } from "../src/report.ts";
import type { ProposalRecord } from "../src/types.ts";

test("generates and writes the Developer Intelligence HTML report", () => {
  const db = openDatabase(":memory:");
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-html-"));

  try {
    insertSnapshot(db, [makeRecord()]);
    const report = buildWeeklyReport(db, new Date("2026-06-12T12:00:00.000Z"));
    assert.ok(report);
    report.chartData.weeklyEventTypeDistribution = {
      labels: ["New proposals"],
      data: [2],
    };

    const html = generateWeeklyHtml(report);
    assert.match(html, /<!doctype html>/);
    assert.match(html, /<meta charset="utf-8">/);
    assert.match(html, /Ethereum Developer Intelligence/);
    assert.match(html, /핵심 신호/);
    assert.match(html, /주간 기술 내러티브/);
    assert.match(html, /주요 기술 이슈/);
    assert.match(html, /신호 근거/);
    assert.match(html, /모멘텀 개요/);
    assert.match(html, /개발자 모멘텀 상세/);
    assert.match(html, /모멘텀 점수 기준 상위 8개 테마를 표시합니다\./);
    assert.match(html, /논의 열기/);
    assert.match(html, /커밋 \/ 변경사항 인텔리전스/);
    assert.match(html, /구현·채택 근거/);
    assert.match(html, /구현·채택 근거/);
    assert.match(html, /테마 심층 분석/);
    assert.match(html, /표준 진행 현황/);
    assert.match(html, /비즈니스 영향/);
    assert.match(html, /권장 액션/);
    assert.doesNotMatch(html, /[湲蹂理]|쨌|�/);
    assert.match(html, /이번 주 핵심 신호/);
    assert.match(html, /class="card hero priority-primary"/);
    assert.match(html, /href="#adoption-evidence">근거 보기/);
    assert.match(html, /href="#watchlist-next-signals">다음 관찰 항목/);
    assert.match(html, /class="section-nav"/);
    assert.match(html, /dashboard-compact/);
    assert.match(html, /lifecycle-rail/);
    assert.match(html, /secondary-lifecycle/);
    assert.match(html, /@media\(max-width:760px\)/);
    assert.match(html, /@media print/);
    assert.match(html, /--bg-base:#0d1312/);
    assert.match(html, /--mint:#00a39f/);
    assert.match(html, /--deep-teal:#008485/);
    assert.match(html, /--fresh-green:#2dc396/);
    assert.match(html, /chart\.umd\.min\.js/);
    assert.match(html, /ERC-4626/);
    assert.match(html, /최근 공개 논의 활동이 감지되지 않았습니다/);
    assert.match(html, /이번 보고 기간에는 proposal 문안 변경이 감지되지 않았습니다/);
    assert.match(html, /<canvas id="developerMomentumChart"><\/canvas>/);
    assert.match(html, /<canvas id="weeklyEventTypeDistributionChart"><\/canvas>/);
    assert.match(
      html,
      /"weeklyEventTypeDistribution":\{"labels":\["New proposals"\],"data":\[2\]\}/,
    );
    assert.match(
      html,
      /drawSeries\("weeklyEventTypeDistributionChart",reportCharts\.weeklyEventTypeDistribution,"doughnut",false,"Event Count"\)/,
    );
    assert.doesNotMatch(html, /Goldstation/);
    assert.doesNotMatch(html, /Hana/i);
    assert.doesNotMatch(html, /\b(adopted|adoption across|implemented by|production use|mainnet usage|ecosystem support|client support|price impact|token price|market impact)\b/i);
    assert.doesNotMatch(html, /Netflix/);
    assert.doesNotMatch(html, /Continue Watching/);
    assert.doesNotMatch(html, />Play</);
    assert.doesNotMatch(html, /client-side router|app routing|react-router/i);
    const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    const inlineScript = inlineScripts.at(-1)?.[1];
    assert.ok(inlineScript);
    assert.doesNotThrow(() => new Function(inlineScript));

    report.chartData.weeklyEventTypeDistribution = { labels: [], data: [] };
    const emptyEventHtml = generateWeeklyHtml(report);
    assert.match(emptyEventHtml, /주간 변경/);
    assert.doesNotMatch(
      emptyEventHtml,
      /drawSeries\("weeklyEventTypeDistributionChart",reportCharts\.weeklyEventTypeDistribution,"doughnut",false,"Event Count"\)/,
    );

    report.chartData.developerMomentumScores = { labels: [], data: [] };
    const emptyMomentumHtml = generateWeeklyHtml(report);
    assert.match(emptyMomentumHtml, /모멘텀 개요/);
    assert.doesNotMatch(emptyMomentumHtml, /<canvas id="developerMomentumChart"><\/canvas>/);

    report.ethereumTechRadar.signalLayer.discussionHeat = [{
        proposalId: "ERC-4626",
        title: "Tokenized Vaults",
        status: "Final",
        theme: "DeFi / Vault",
      discussionUrl: "https://ethereum-magicians.org/t/erc-4626",
      discussionLinks: ["https://ethereum-magicians.org/t/erc-4626"],
      discussionScore: 20,
      discussionActivityScore: 70,
      discussionTitle: "ERC-4626 discussion",
      discussionSource: "Ethereum Magicians",
      discussionCreatedAt: "2026-06-01T00:00:00.000Z",
      discussionLastActivityAt: "2026-06-11T00:00:00.000Z",
      discussionReplyCount: 12,
      discussionParticipantCount: 7,
      discussionViewCount: 2100,
      discussionTags: ["erc", "defi"],
      discussionFreshnessDays: 1,
      activityLevel: "High",
      whyItMatters: "Discussion metadata exists and the proposal changed in the current report window.",
      canonicalUrl: "https://example.test/ERC-4626",
    }];
    report.ethereumTechRadar.signalLayer.diffIntelligence = [{
      proposalId: "ERC-4626",
      title: "Tokenized Vaults",
      changedFiles: ["ERCS/erc-4626.md"],
      changedSections: null,
      diffSummary: "Recent proposal content changed; section-level diff not available.",
      diffEvidence: "rawContentHash changed between snapshots",
      canonicalUrl: "https://example.test/ERC-4626",
    }];
    const signalHtml = generateWeeklyHtml(report);
    assert.match(signalHtml, /class="top-signal"/);
    assert.match(signalHtml, /https:\/\/ethereum-magicians\.org\/t\/erc-4626/);
    assert.match(signalHtml, /ERC-4626 discussion/);
    assert.match(signalHtml, /Ethereum Magicians/);
    assert.match(signalHtml, /링크 열기/);
    assert.match(signalHtml, /Recent proposal content changed; section-level diff not available\.|최근 proposal content가 변경됐으며 section-level diff는 사용할 수 없습니다\./);
    assert.match(signalHtml, /ERCS\/erc-4626\.md/);

    const outputPath = writeWeeklyHtmlReport(report, directory);
    assert.equal(outputPath, join(directory, "weekly-2026-06-12.html"));
    assert.equal(existsSync(outputPath), true);
    assert.match(readFileSync(outputPath, "utf8"), /권장 액션/);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("renders Discussion Heat with partial and unavailable metadata", () => {
  const db = openDatabase(":memory:");

  try {
    insertSnapshot(db, [makeRecord()]);
    const report = buildWeeklyReport(db, new Date("2026-06-12T12:00:00.000Z"));
    assert.ok(report);
    report.ethereumTechRadar.signalLayer.discussionHeat = [
      {
        proposalId: "ERC-1",
        title: "Partial",
        status: "Draft",
        theme: "Wallet UX",
        discussionUrl: "https://ethereum-magicians.org/t/partial/1",
        discussionLinks: ["https://ethereum-magicians.org/t/partial/1"],
        discussionScore: 25,
        discussionActivityScore: 25,
        discussionTitle: "Partial discussion",
        discussionSource: "Ethereum Magicians",
        discussionReplyCount: 3,
        whyItMatters: "Older discussion exists, but recent activity is limited.",
        canonicalUrl: "https://example.test/ERC-1",
      },
      {
        proposalId: "ERC-2",
        title: "Unavailable",
        status: "Draft",
        theme: "Unclassified",
        discussionUrl: "https://example.test/topic",
        discussionLinks: ["https://example.test/topic"],
        discussionScore: 10,
        discussionActivityScore: 10,
        activityLevel: "Unknown",
        discussionSummaryFallback: "Discussion metadata available; activity details unavailable.",
        whyItMatters: "Discussion metadata available; activity details unavailable.",
        canonicalUrl: "https://example.test/ERC-2",
      },
    ];

    const html = generateWeeklyHtml(report);
    assert.match(html, /Partial discussion/);
    assert.match(html, /class="top-signal"/);
    assert.match(html, /활동성 점수는 확인 가능한 공개 discussion metadata를 사용합니다/);
    assert.match(html, /활동 세부 정보 확인 불가/);
    assert.match(html, /확인 불가/);
    assert.doesNotMatch(html, /N\/A/);
    assert.doesNotMatch(html, /Discussion metadata available; activity details unavailable/);
    assert.doesNotMatch(html, /placeholder/i);
    assert.doesNotMatch(html, /Phase 7-B/);
    assert.doesNotMatch(html, /not collected/i);
  } finally {
    db.close();
  }
});

test("writes Korean HTML as UTF-8 without mojibake", () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-utf8-"));
  const path = join(directory, "encoding.html");
  const expected = "기준일 · 라이프사이클 인텔리전스 · 구현 추적 · 최근 7일 동안 감지된 변경 데이터가 없습니다.";

  try {
    writeFileSync(path, expected, { encoding: "utf8" });
    const actual = readFileSync(path, "utf8");

    assert.equal(actual, expected);
    assert.doesNotMatch(actual, /[湲蹂理]|쨌|�/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeRecord(): ProposalRecord {
  return {
    proposalId: "ERC-4626",
    kind: "ERC",
    number: 4626,
    title: "Tokenized Vaults",
    status: "Final",
    proposalType: "Standards Track",
    category: "ERC",
    created: "2026-01-22",
    updated: null,
    discussionTo: null,
    discussionLinks: [],
    sourceRepo: "ethereum/ercs",
    sourcePath: "ERCS/erc-4626.md",
    canonicalUrl: "https://example.test/ERC-4626",
    rawContentHash: "hash",
  };
}
