import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chdir, cwd } from "node:process";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { insertSnapshot, openDatabase } from "../src/db.ts";
import { generateWeeklyDebugJson, generateWeeklyHtml, weeklyDebugJsonPath, writeWeeklyHtmlReport } from "../src/html-report.ts";
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
    assert.match(html, /Ethereum Technology Atlas/);
    assert.match(html, /Ethereum 개발 인텔리전스/);
    assert.match(html, /Executive Pulse/);
    assert.match(html, /Technology Landscape/);
    assert.match(html, /Focus & Progress/);
    assert.match(html, /Developer Attention/);
    assert.match(html, /Account Abstraction Radar/);
    assert.doesNotMatch(html, /기술 성숙도/);
    assert.match(html, /Evidence & Data Quality/);
    assert.match(html, /이번 주 관찰 신호/);
    assert.match(html, /KGLD Technology Watch/);
    assert.match(html, /Proposal 근거 appendix/);
    assert.doesNotMatch(html, /Evolution Timeline/);
    assert.doesNotMatch(html, /Business Impact/);
    assert.doesNotMatch(html, /DATA COLLECTION DEGRADED/);
    assert.doesNotMatch(html, /Executive Rating/);
    assert.doesNotMatch(html, /Implementation and Lifecycle/);
    assert.doesNotMatch(html, /Evidence and Limitations/);
    assert.match(html, /Proposal 근거 appendix/);
    assert.doesNotMatch(html, /Theme Scores/);
    assert.doesNotMatch(html, /Discussion Links/);
    assert.doesNotMatch(html, /KGLD Scoring Details/);
    assert.doesNotMatch(html, /Calculation and Traceability Metadata/);
    assert.doesNotMatch(html, /Raw Chart Data/);
    assert.doesNotMatch(html, /[湲蹂理]|쨌|�/);
    assert.doesNotMatch(html, /Current Era/);
    assert.match(html, /class="report-cover dashboard-cover"/);
    assert.match(html, /분석 기간/);
    assert.match(html, /Generated/);
    const visibleShell = html
      .replace(/<style>[\s\S]*?<\/style>/, "")
      .replace(/<script type="application\/json" id="technology-platform-api">[\s\S]*?<\/script>/, "")
      .replace(/<!-- EIPreporter chart data: [\s\S]*? -->/, "")
      .replace(/<script>[\s\S]*?<\/script>/, "");
    assert.match(html, /class="atlas-domain-grid"/);
    assert.match(html, /class="five-lane"/);
    assert.doesNotMatch(html, /class="atlas-node-map"/);
    assert.match(html, /class="section-nav"/);
    assert.doesNotMatch(visibleShell, /glance-strip/);
    assert.equal((html.match(/<nav class="section-nav"[\s\S]*?<\/nav>/)?.[0].match(/<a /g) ?? []).length, 8);
    assert.doesNotMatch(
      html
        .replace(/<script type="application\/json" id="technology-platform-api">[\s\S]*?<\/script>/, "")
        .replace(/<!-- EIPreporter chart data: [\s\S]*? -->/, "")
        .replace(/<script>[\s\S]*?<\/script>/, ""),
      /KPI 대시보드/i,
    );
    assert.doesNotMatch(
      html
        .replace(/<style>[\s\S]*?<\/style>/, "")
        .replace(/<script type="application\/json" id="technology-platform-api">[\s\S]*?<\/script>/, "")
        .replace(/<!-- EIPreporter chart data: [\s\S]*? -->/, ""),
      /lifecycle-rail/,
    );
    assert.match(html, /@media\(max-width:680px\)/);
    assert.match(html, /@media print/);
    assert.match(html, /--bg:#fff/);
    assert.match(html, /--blue:#1f6feb/);
    assert.match(html, /--container:1400px/);
    assert.match(html, /main\{width:min\(var\(--container\),calc\(100% - 88px\)\)/);
    assert.match(html, /counter-reset:report-section/);
    assert.match(html, /counter-increment:report-section/);
    assert.doesNotMatch(html, /class="sidebar"/);
    assert.doesNotMatch(html, /class="hero-primary"/);
    assert.doesNotMatch(html, /class="hero-secondary"/);
    assert.doesNotMatch(html, /class="lower-grid"/);
    assert.doesNotMatch(html, /class="review-card"/);
    assert.doesNotMatch(html, /report-header:before|brand-mark|chip-icon|icon-only|floating|blue ellipse|abstract blob|conic-gradient/);
    assert.doesNotMatch(html, /Proposal Status Overview/);
    assert.match(html, /@media\(max-width:1040px\)/);
    assert.match(html, /\.section-nav,script\{display:none!important\}/);
    assert.doesNotMatch(html, /chart\.umd\.min\.js/);
    assert.match(html, /class="atlas-chart-frame"/);
    assert.match(html, /Technology Landscape/);
    assert.match(html, /Developer Attention/);
    assert.match(html, /class="atlas-chart-frame"/);
    assert.doesNotMatch(html, /id="atlasTechnologyDistributionChart"/);
    const platformApi = JSON.parse(html.match(/<script type="application\/json" id="technology-platform-api">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
    assert.ok(platformApi.intelligenceSnapshot);
    assert.ok(Array.isArray(platformApi.intelligenceSnapshot.facts.topicMembershipFacts));
    assert.equal(platformApi.validatedThemeEdgeSummary, undefined);
    assert.equal(platformApi.publishedTopicEdges, undefined);
    assert.equal(platformApi.regressionTraceability, undefined);
    assert.equal(platformApi.unclusteredProposalSummary, undefined);
    assert.equal(platformApi.sourceCoverage, undefined);
    assert.ok(Array.isArray(platformApi.intelligenceSnapshot.facts.specificationEvidence));
    assert.ok(Array.isArray(platformApi.intelligenceSnapshot.facts.discussionPosts));
    assert.ok(Array.isArray(platformApi.intelligenceSnapshot.aggregates.metricDictionary));
    assert.equal(platformApi.technologyAtlasSummary, undefined);
    assert.equal(platformApi.technologyDomains, undefined);
    assert.equal(platformApi.technologyRelationships, undefined);
    assert.equal(platformApi.technologyMaturity, undefined);
    assert.equal(platformApi.validatedThemeEdges, undefined);
    assert.equal(platformApi.unclusteredProposals, undefined);
    assert.equal(platformApi.topicDiagnostics, undefined);
    assert.match(html, /ERC-4626/);
    assert.match(html, /이번 주 관찰 신호/);
    assert.doesNotMatch(html, /<canvas id="developerMomentumChart"><\/canvas>/);
    assert.doesNotMatch(html, /<canvas id="weeklyEventTypeDistributionChart"><\/canvas>/);
    assert.doesNotMatch(html, /Goldstation/);
    const visibleWithoutApi = html
      .replace(/<style>[\s\S]*?<\/style>/, "")
      .replace(/<script type="application\/json" id="technology-platform-api">[\s\S]*?<\/script>/, "")
      .replace(/<!-- EIPreporter chart data: [\s\S]*? -->/, "")
      .replace(/<script>[\s\S]*?<\/script>/, "");
    assert.doesNotMatch(visibleWithoutApi, /\bCRITICAL\b|\bHIGH\b/);
    assert.doesNotMatch(visibleWithoutApi, /Evidence Count/);
    assert.doesNotMatch(visibleWithoutApi, /Confidence\s+\d+\/100|신뢰도 높음\s+\d+\/100/);
    assert.doesNotMatch(visibleWithoutApi, /&lt;span|&amp;lt;|class=&quot;/);
    assert.doesNotMatch(visibleWithoutApi, /Watch because|Escalate only|no verified implementation evidence|whether recent diffs continue next week|Current AA direction|Wallet flow relevance is plausible|Implementation evidence is not adoption/);
    assert.doesNotMatch(visibleWithoutApi, /수집된 직접 근거 없음/);
    assert.doesNotMatch(visibleWithoutApi, /검증된 구현·릴리스·활성화 직접 근거 없음/);
    assert.doesNotMatch(visibleWithoutApi, /채택 근거 object/);
    assert.doesNotMatch(visibleWithoutApi, /Proposal-Evidence 연결/);
    assert.doesNotMatch(visibleWithoutApi, /수집 신뢰도|근거 신뢰도|Confidence\s+\d+\/100/);
    assert.match(visibleWithoutApi, /Evidence & Data Quality/);
    assert.doesNotMatch(visibleWithoutApi, /topic confidence|canonical classification|fallback|current7d|previous7d|topic membership|change evidence|대표 topic 부족/);
    assert.doesNotMatch(visibleWithoutApi.replace(/<[^>]+>/g, " "), /tokens-finance|identity-compliance|execution-state|accounts-wallets|scaling-data|validators-consensus/);
    assert.doesNotMatch(visibleWithoutApi, /classification confidence|canonical primary domain|verified technology|confidence 63|confidence 79/);
    assert.doesNotMatch(html, /Hana/i);
    assert.doesNotMatch(visibleWithoutApi, /\b(adopted|adoption across|implemented by|production use|mainnet usage|ecosystem support|client support|price impact|token price|market impact)\b/i);
    assert.doesNotMatch(html, /Netflix/);
    assert.doesNotMatch(html, /Continue Watching/);
    assert.doesNotMatch(html, />Play</);
    assert.doesNotMatch(html, /client-side router|app routing|react-router/i);
    const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    const inlineScript = inlineScripts.at(-1)?.[1];
    assert.ok(inlineScript);
    assert.doesNotThrow(() => new Function(inlineScript));

    const debugJson = JSON.parse(generateWeeklyDebugJson(report));
    assert.ok(Array.isArray(debugJson.validatedThemeEdges));
    assert.ok(Array.isArray(debugJson.themeAssignments));
    assert.ok(Array.isArray(debugJson.topicMemberships));
    assert.ok(Array.isArray(debugJson.unclusteredProposals));
    assert.equal(debugJson.validatedThemeEdges.length, debugJson.topicDiagnostics.rawThemeEdgeCount);
    assert.ok(Array.isArray(platformApi.intelligenceSnapshot.facts.topicMembershipFacts));
    assert.ok(JSON.stringify(platformApi).length < JSON.stringify(debugJson).length);

    const writtenPath = writeWeeklyHtmlReport(report, directory);
    const debugPath = weeklyDebugJsonPath(report);
    const compactPath = join(directory, "weekly-2026-06-12.compact.json");
    const qualityPath = join(directory, "weekly-2026-06-12.quality.json");
    rmSync(debugPath, { force: true });
    assert.ok(existsSync(writtenPath));
    assert.ok(existsSync(compactPath));
    assert.ok(existsSync(qualityPath));
    assert.ok(JSON.parse(readFileSync(qualityPath, "utf8")).passed);
    assert.equal(existsSync(debugPath), false);

    writeWeeklyHtmlReport(report, directory, { debug: true });
    assert.ok(existsSync(debugPath));
    assert.doesNotThrow(() => JSON.parse(gunzipSync(readFileSync(debugPath)).toString("utf8")));

    report.chartData.weeklyEventTypeDistribution = { labels: [], data: [] };
    const emptyEventHtml = generateWeeklyHtml(report);
    assert.match(emptyEventHtml, /이번 주 관찰 신호/);
    assert.doesNotMatch(
      emptyEventHtml,
      /drawSeries\("weeklyEventTypeDistributionChart",reportCharts\.weeklyEventTypeDistribution,"doughnut",false,"Event Count"\)/,
    );

    report.chartData.developerMomentumScores = { labels: [], data: [] };
    const emptyMomentumHtml = generateWeeklyHtml(report);
    assert.doesNotMatch(emptyMomentumHtml, /Raw Chart Data/);
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
    assert.match(signalHtml, /이번 주 관찰 신호/);
    assert.doesNotMatch(signalHtml, /class="top-signal"/);
    assert.doesNotMatch(signalHtml, /Recent proposal content changed; section-level diff not available\.|최근 proposal content가 변경됐으며 section-level diff는 사용할 수 없습니다\./);
    assert.doesNotMatch(signalHtml, /ERCS\/erc-4626\.md/);

    const outputPath = writeWeeklyHtmlReport(report, directory);
    assert.equal(outputPath, join(directory, "weekly-2026-06-12.html"));
    assert.equal(existsSync(outputPath), true);
    assert.match(readFileSync(outputPath, "utf8"), /KGLD Technology Watch/);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("keeps Discussion Heat diagnostics out of the end-user IA", () => {
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
    assert.match(html, /Executive Pulse/);
    assert.doesNotMatch(html, /Partial discussion/);
    assert.doesNotMatch(html, /class="top-signal"/);
    assert.doesNotMatch(html, /활동성 점수는 확인 가능한 공개 논의 메타데이터만 사용합니다/);
    assert.doesNotMatch(html, /활동 세부 정보 확인 불가/);
    assert.doesNotMatch(html, /N\/A/);
    assert.doesNotMatch(html, /Discussion metadata available; activity details unavailable/);
    assert.doesNotMatch(html, /placeholder/i);
    assert.doesNotMatch(html, /Phase 7-B/);
    assert.doesNotMatch(
      html.replace(/<script type="application\/json" id="technology-platform-api">[\s\S]*?<\/script>/, ""),
      /not collected/i,
    );
  } finally {
    db.close();
  }
});

test("renders AA baseline proposals when optional metadata is null or uncollected", () => {
  const db = openDatabase(":memory:");
  const originalCwd = cwd();
  const emptyDirectory = mkdtempSync(join(tmpdir(), "eipreporter-aa-nullable-"));

  try {
    insertSnapshot(db, [makeRecord()]);
    const report = buildWeeklyReport(db, new Date("2026-06-12T12:00:00.000Z"));
    assert.ok(report);
    report.ethereumTechRadar.signalLayer.discussionHeat = [];

    chdir(emptyDirectory);
    const html = generateWeeklyHtml(report);
    const visibleHtml = visibleReportHtml(html);

    assert.match(html, /https:\/\/eips\.ethereum\.org\/EIPS\/eip-4337/);
    assert.match(visibleHtml, /Discussion source 미수집/);
    assert.doesNotMatch(visibleHtml, /href=""/);
    assert.doesNotMatch(visibleHtml, /\bnull\b|\bundefined\b/);

    const platformApi = JSON.parse(html.match(/<script type="application\/json" id="technology-platform-api">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
    assert.equal(platformApi.intelligenceSnapshot.views.accountAbstraction.tracks.length, 12);
    assert.match(html, /https:\/\/eips\.ethereum\.org\/EIPS\/eip-8286/);
    assert.match(html, /https:\/\/ethereum-magicians\.org\/t\/draft-erc-8286-modular-accounts-for-frame-transactions\/28695/);
  } finally {
    chdir(originalCwd);
    db.close();
    rmSync(emptyDirectory, { recursive: true, force: true });
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

function visibleReportHtml(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<script type="application\/json" id="technology-platform-api">[\s\S]*?<\/script>/, "")
    .replace(/<!-- EIPreporter chart data: [\s\S]*? -->/, "")
    .replace(/<script>[\s\S]*?<\/script>/, "");
}

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
