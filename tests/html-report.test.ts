import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chdir, cwd } from "node:process";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { insertSnapshot, openDatabase } from "../src/db.ts";
import { __qualityTestHooks, generateWeeklyDebugJson, generateWeeklyHtml, weeklyDebugJsonPath, writeWeeklyHtmlReport } from "../src/html-report.ts";
import { buildWeeklyReport } from "../src/report.ts";
import type { ChangeEvent, EmergingIssue, ProposalRecord, WeeklyRadarReport } from "../src/types.ts";

function assertHtmlDoesNotContain(html: string, forbidden: string | RegExp, context: string): void {
  const match = typeof forbidden === "string" ? html.indexOf(forbidden) : html.search(forbidden);
  if (match < 0) return;
  const label = typeof forbidden === "string" ? forbidden : forbidden.toString();
  const start = Math.max(0, match - 200);
  const end = Math.min(html.length, match + 200);
  assert.fail([
    `Forbidden public HTML content: ${label}`,
    `Context: ${context}`,
    `Found near: ${JSON.stringify(html.slice(start, end))}`,
  ].join("\n"));
}

function assertNoPublicPathLeakage(html: string, context: string): void {
  const forbidden: Array<string | RegExp> = [
    ".sources/",
    ".sources\\",
    "/home/runner/work/",
    "C:\\Users\\",
    /(?:^|[^/:])EIPS\/eip-\d+\.md/i,
    /(?:^|[^/:])ERCS\/erc-\d+\.md/i,
    /(?:^|[^:])EIPS\\eip-\d+\.md/i,
    /(?:^|[^:])ERCS\\erc-\d+\.md/i,
  ];
  for (const pattern of forbidden) assertHtmlDoesNotContain(html, pattern, context);
}

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
    assert.match(html, /Ethereum Standards Weekly - 2026-06-12/);
    assert.match(html, /Ethereum 개발 인텔리전스/);
    assert.match(html, /Executive Pulse/);
    assert.match(html, /Technology Landscape/);
    assert.match(html, /Focus & Progress/);
    assert.match(html, /Developer Attention/);
    assert.match(html, /Account Abstraction Radar/);
    assert.doesNotMatch(html, /기술 성숙도/);
    assert.match(html, /Evidence & Data Quality/);
    assert.match(html, /이번 주 공식 저장소 반영/);
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
    assert.match(html, /class="dash-v3"/);
    assert.match(html, /data-period="7d"[\s\S]*data-period="30d"[\s\S]*data-period="180d"/);
    assert.match(html, /Generated/);
    const visibleShell = html
      .replace(/<style>[\s\S]*?<\/style>/, "")
      .replace(/<script type="application\/json" id="technology-platform-api">[\s\S]*?<\/script>/, "")
      .replace(/<!-- EIPreporter chart data: [\s\S]*? -->/, "")
      .replace(/<script>[\s\S]*?<\/script>/, "");
    assert.match(html, /class="dash-domain-list"/);
    assert.match(html, /class="dash-life-stack"/);
    assert.doesNotMatch(html, /class="atlas-node-map"/);
    assert.match(html, /class="dash-section-nav"/);
    assert.match(html, /\.dash-section-nav\{position:sticky/);
    assert.match(html, /\.dash-toolbar\{position:relative/);
    assert.doesNotMatch(html, /\.dash-toolbar\{position:sticky/);
    assert.match(html, /\.dash-section\{scroll-margin-top:calc\(var\(--dash-sticky-nav-height,58px\) \+ 32px\)/);
    assert.match(html, /\.dash-grid-7-5\{grid-template-columns:minmax\(0,2fr\) minmax\(280px,1fr\)/);
    assert.match(html, /\.dash-domain-row\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
    assert.match(html, /\.dash-domain-copy\{min-width:0;word-break:keep-all;overflow-wrap:anywhere\}/);
    assert.match(html, /\.dash-signal-main small\{display:block[^}]*overflow:visible\}/);
    assert.doesNotMatch(html, /\.dash-signal-main small\{[^}]*-webkit-line-clamp/);
    assert.doesNotMatch(visibleShell, /glance-strip/);
    assert.equal((html.match(/<nav class="dash-section-nav"[\s\S]*?<\/nav>/)?.[0].match(/<a /g) ?? []).length, 11);
    assert.match(html, /WHAT'S HAPPENING NOW/);
    assert.match(html, /EMERGING SIGNALS/);
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
    assert.match(html, /class="dash-trend-card"/);
    assert.match(html, /Technology Landscape/);
    assert.match(html, /Developer Attention/);
    assert.match(html, /class="dash-trend-card"/);
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
    assert.match(html, /이번 주 공식 저장소 반영/);
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
    assert.match(emptyEventHtml, /이번 주 공식 저장소 반영/);
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
    assert.match(signalHtml, /이번 주 공식 저장소 반영/);
    assert.doesNotMatch(signalHtml, /class="top-signal"/);
    assert.doesNotMatch(signalHtml, /Recent proposal content changed; section-level diff not available\.|최근 proposal content가 변경됐으며 section-level diff는 사용할 수 없습니다\./);
    assertHtmlDoesNotContain(signalHtml, /ERCS\/erc-4626\.md/, "signal diff intelligence must not expose raw changedFiles");
    assertNoPublicPathLeakage(signalHtml, "signal HTML public path leakage");

    const outputPath = writeWeeklyHtmlReport(report, directory);
    assert.equal(outputPath, join(directory, "weekly-2026-06-12.html"));
    assert.equal(existsSync(outputPath), true);
    assert.match(readFileSync(outputPath, "utf8"), /KGLD Technology Watch/);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("renders proposal navigation, related proposals, and official URL policy", () => {
  const db = openDatabase(":memory:");
  try {
    insertSnapshot(db, [
      makeRecord("EIP-8363", "Draft", "hash-8363", "Tapered Issuance Burn", "Core"),
      makeRecord("ERC-6551", "Final", "hash-6551", "Non-fungible Token Bound Accounts", "ERC"),
      makeRecord("ERC-8216", "Draft", "hash-8216", "Slot-Based Equipment for ERC-6551 Accounts", "ERC"),
    ]);
    const report = buildWeeklyReport(db, new Date("2026-08-10T00:00:00.000Z"));
    assert.ok(report);
    report.ethereumTechRadar.emergingLayer = {
      generatedAt: report.generatedAt,
      sourceStatus: [],
      rawSignals: [],
      issues: [],
      whatsHappeningNow: [{
        issueId: "proposal:ERC-8216",
        title: "Slot-Based Equipment for ERC-6551 Accounts",
        primaryProposalId: "ERC-8216",
        relatedProposalIds: ["ERC-6551"],
        eipIds: ["ERC-8216", "ERC-6551"],
        status: "HOT_ISSUE",
        stage: "PRE_MERGE",
        heatScore: 63,
        confidenceScore: 72,
        sources: ["github_pr", "ethereum_magicians"],
        metrics: { replyCount: 18, viewCount: 900, participantCount: 6, velocity: [] },
        scoreBreakdown: [],
        sourceSignals: [
          { source: "github_pr", sourceId: "ethereum/ercs#8216", sourceRepo: "ethereum/ercs", url: "https://github.com/ethereum/ercs/pull/8216", title: "Slot-Based Equipment for ERC-6551 Accounts", primaryProposalId: "ERC-8216", relatedProposalIds: ["ERC-6551"], extractedEipIds: ["ERC-8216", "ERC-6551"], collectedAt: report.generatedAt, facts: {} },
          { source: "ethereum_magicians", sourceId: "8216-topic", url: "https://ethereum-magicians.org/t/slot-equipment/8216", title: "ERC-8216: Slot-Based Equipment", primaryProposalId: "ERC-8216", relatedProposalIds: [], extractedEipIds: ["ERC-8216"], collectedAt: report.generatedAt, facts: {} },
        ],
        summaries: { whatIsHappening: "GitHub PR과 Magicians 활동이 함께 확인됩니다.", whyMoving: "복수 출처에서 최근 activity가 있습니다.", whyItMatters: "참조와 subject를 분리해 확인해야 합니다.", watchNext: "PR merge와 thread activity를 확인합니다." },
        facts: { sourceCount: 2 },
      }],
      emergingSignals: [{
        issueId: "proposal:EIP-8363",
        title: "Tapered Issuance Burn",
        primaryProposalId: "EIP-8363",
        relatedProposalIds: [],
        eipIds: ["EIP-8363"],
        status: "EARLY_SIGNAL",
        stage: "DISCUSSION",
        heatScore: 41,
        confidenceScore: 57,
        sources: ["ethereum_magicians"],
        metrics: { velocity: [] },
        scoreBreakdown: [],
        sourceSignals: [{ source: "ethereum_magicians", sourceId: "8363-topic", url: "https://ethereum-magicians.org/t/tapered-issuance-burn/8363", title: "EIP-8363: Tapered Issuance Burn", primaryProposalId: "EIP-8363", relatedProposalIds: [], extractedEipIds: ["EIP-8363"], collectedAt: report.generatedAt, facts: {} }],
        summaries: { whatIsHappening: "Magicians discussion is active.", whyMoving: "최근 토론 후보입니다.", whyItMatters: "issuance 관련 논의입니다.", watchNext: "공식 문서 여부를 확인합니다." },
        facts: { sourceCount: 1 },
      }],
      decisionWatch: [{
        issueId: "topic:future-issuance-policy-discussion",
        title: "Future issuance policy discussion",
        eipIds: [],
        relatedProposalIds: [],
        status: "EARLY_SIGNAL",
        stage: "DISCUSSION",
        heatScore: 36,
        confidenceScore: 45,
        sources: ["ethereum_magicians"],
        metrics: { velocity: [] },
        scoreBreakdown: [],
        sourceSignals: [{ source: "ethereum_magicians", sourceId: "unnumbered", url: "https://ethereum-magicians.org/t/future-issuance-policy/999", title: "Future issuance policy discussion", extractedEipIds: [], collectedAt: report.generatedAt, facts: {} }],
        summaries: { whatIsHappening: "번호 없는 토론입니다.", whyMoving: "최근 활동이 있습니다.", whyItMatters: "아직 공식 proposal 번호가 없습니다.", watchNext: "Magicians thread를 확인합니다." },
        facts: { sourceCount: 1 },
      }],
      generatedBy: "deterministic_emerging_signal_engine",
    };

    const html = generateWeeklyHtml(report);
    assert.match(html, /https:\/\/eips\.ethereum\.org\/EIPS\/eip-8363/);
    assert.match(html, /https:\/\/ercs\.ethereum\.org\/ERCS\/erc-6551/);
    assert.match(html, /https:\/\/ercs\.ethereum\.org\/ERCS\/erc-8216/);
    assert.match(html, /Related[\s\S]*ERC-6551/);
    assert.match(html, /설명 보기/);
    assert.match(html, /GitHub PR/);
    assert.match(html, /Magicians/);
    assert.match(html, /UNNUMBERED DRAFT/);
    assert.doesNotMatch(html, /eip-undefined|erc-undefined|eip-Future issuance/);
  } finally {
    db.close();
  }
});

test("renders top-N hidden emerging candidates in full Emerging view and collapses empty Decision Watch space", () => {
  const db = openDatabase(":memory:");
  try {
    insertSnapshot(db, Array.from({ length: 8 }, (_, index) => makeRecord(`EIP-${9300 + index}`, "Draft", `hash-${index}`, `Fixture ${index}`, "Core")));
    const report = buildWeeklyReport(db, new Date("2026-08-10T00:00:00.000Z"));
    assert.ok(report);
    const issues = Array.from({ length: 8 }, (_, index) => emergingIssue(`EIP-${9300 + index}`, 50 - index, index));
    report.ethereumTechRadar.emergingLayer = {
      generatedAt: report.generatedAt,
      sourceStatus: [],
      rawSignals: issues.flatMap((issue) => issue.sourceSignals),
      issues,
      whatsHappeningNow: [],
      emergingSignals: issues,
      decisionWatch: [],
      generatedBy: "deterministic_emerging_signal_engine",
    };

    const html = generateWeeklyHtml(report);
    assert.match(html, /Emerging 후보 전체 8건 보기/);
    assert.match(html, /Full list only candidate 7/);
    assert.match(html, /dash-emerging-split dash-emerging-split-full/);
    assert.doesNotMatch(html, /<section id="decision-watch">/);
  } finally {
    db.close();
  }
});

test("renders every meaningful emerging issue status in the full Emerging view", () => {
  const db = openDatabase(":memory:");
  try {
    insertSnapshot(db, [
      makeRecord("EIP-9400", "Draft", "hash-hot", "Hot Fixture", "Core"),
      makeRecord("EIP-9401", "Draft", "hash-early", "Early Fixture", "Core"),
      makeRecord("EIP-9402", "Draft", "hash-decision", "Decision Fixture", "Core"),
    ]);
    const report = buildWeeklyReport(db, new Date("2026-08-10T00:00:00.000Z"));
    assert.ok(report);
    const hot = emergingIssue("EIP-9400", 90, 0, "HOT_ISSUE");
    const early = emergingIssue("EIP-9401", 51, 1, "EARLY_SIGNAL");
    const decision = emergingIssue("EIP-9402", 72, 2, "DECISION_WATCH");
    report.ethereumTechRadar.emergingLayer = {
      generatedAt: report.generatedAt,
      sourceStatus: [],
      rawSignals: [hot, early, decision].flatMap((issue) => issue.sourceSignals),
      issues: [hot, decision, early],
      whatsHappeningNow: [hot],
      emergingSignals: [early],
      decisionWatch: [decision],
      generatedBy: "deterministic_emerging_signal_engine",
    };

    const html = generateWeeklyHtml(report);
    const mainSection = html.match(/<div class="dash-emerging-grid">([\s\S]*?)<div class="dash-emerging-split/)?.[1] ?? "";
    const fullSection = html.match(/<details class="dash-compact-details dash-emerging-full" id="emerging-full">([\s\S]*?)<\/details>/)?.[1] ?? "";

    assert.match(mainSection, /EIP-9400/);
    assert.match(fullSection, /Emerging 후보 전체 3건 보기/);
    assert.match(fullSection, /EIP-9400[\s\S]*HOT_ISSUE/);
    assert.match(fullSection, /EIP-9401[\s\S]*EARLY_SIGNAL/);
    assert.match(fullSection, /EIP-9402[\s\S]*DECISION_WATCH/);
  } finally {
    db.close();
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

    assert.match(html, /https:\/\/ercs\.ethereum\.org\/ERCS\/erc-4337/);
    assert.match(visibleHtml, /Discussion source 미수집/);
    assert.doesNotMatch(visibleHtml, /href=""/);
    assert.doesNotMatch(visibleHtml, /\bnull\b|\bundefined\b/);

    const platformApi = JSON.parse(html.match(/<script type="application\/json" id="technology-platform-api">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
    assert.equal(platformApi.intelligenceSnapshot.views.accountAbstraction.tracks.length, 12);
    assert.match(html, /https:\/\/ercs\.ethereum\.org\/ERCS\/erc-8286/);
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

test("parses abstract-less EIP documents when substantive body sections exist", () => {
  const eip1Like = `---
eip: 1
title: EIP Purpose and Guidelines
status: Living
type: Meta
---

# EIP-1: EIP Purpose and Guidelines

## Table of Contents

- [What is an EIP?](#what-is-an-eip)
- [EIP Work Flow](#eip-work-flow)

## What is an EIP?

EIP stands for Ethereum Improvement Proposal. An EIP is a design document providing information to the Ethereum community, or describing a new feature for Ethereum or its processes or environment.

## EIP Work Flow

The EIP process begins with a new idea for Ethereum. Each proposal should have a champion who writes the EIP using the style and format described here.
`;

  const parsed = __qualityTestHooks.parseLocalSpecificationMarkdown(eip1Like);

  assert.equal(parsed.officialTitle, "EIP Purpose and Guidelines");
  assert.equal(parsed.abstractText, null);
  assert.equal(parsed.parseState, "body_parsed");
  assert.match(parsed.specificationIntroText ?? "", /EIP stands for Ethereum Improvement Proposal/);
});

test("keeps abstract-less title and table-of-contents-only documents as title_only", () => {
  const tocOnly = `---
eip: 9999
title: Empty Draft
status: Draft
---

# EIP-9999: Empty Draft

## Table of Contents

- [Overview](#overview)

## Overview

- [Reference](https://example.test/reference)
`;

  const parsed = __qualityTestHooks.parseLocalSpecificationMarkdown(tocOnly);

  assert.equal(parsed.officialTitle, "Empty Draft");
  assert.equal(parsed.abstractText, null);
  assert.equal(parsed.specificationIntroText, null);
  assert.equal(parsed.parseState, "title_only");
});

test("preserves regular abstract specification parsing", () => {
  const normal = `---
eip: 4626
title: Tokenized Vaults
status: Final
---

# ERC-4626: Tokenized Vaults

## Abstract

This standard is an extension for tokenized Vaults that represent shares of a single underlying ERC-20 token.

## Specification

Tokenized Vaults MUST implement ERC-20 to represent shares. The vault interface exposes standardized deposit, mint, withdraw, and redeem flows.
`;

  const parsed = __qualityTestHooks.parseLocalSpecificationMarkdown(normal);

  assert.equal(parsed.officialTitle, "Tokenized Vaults");
  assert.match(parsed.abstractText ?? "", /tokenized Vaults/);
  assert.match(parsed.specificationIntroText ?? "", /MUST implement ERC-20/);
  assert.equal(parsed.parseState, "body_parsed");
});

test("classifies missing official files separately from title-only body parsing", () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-official-source-"));
  const previousEipPath = process.env.EIP_OFFICIAL_REPO_PATH;
  try {
    mkdirSync(join(directory, "EIPS"), { recursive: true });
    process.env.EIP_OFFICIAL_REPO_PATH = directory;

    const missing = __qualityTestHooks.localSpecificationEvidence("EIP-8363");
    assert.equal(missing.parseState, "title_only");
    assert.equal(missing.officialSourceState, "official_file_not_found");
    assert.match(missing.officialSourcePath ?? "", /EIPS[\\/]eip-8363\.md$/);

    writeFileSync(join(directory, "EIPS", "eip-8363.md"), `---
eip: 8363
title: Generic Emerging Fixture
status: Draft
---

# EIP-8363: Generic Emerging Fixture

## Abstract

This proposal defines a source-first emerging proposal fixture with enough public prose to count as parsed body evidence.
`, { encoding: "utf8" });

    const parsed = __qualityTestHooks.localSpecificationEvidence("EIP-8363");
    assert.equal(parsed.parseState, "body_parsed");
    assert.equal(parsed.officialSourceState, "official_body_parsed");
  } finally {
    if (previousEipPath === undefined) delete process.env.EIP_OFFICIAL_REPO_PATH;
    else process.env.EIP_OFFICIAL_REPO_PATH = previousEipPath;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("public HTML hides raw source paths when official source file is absent or present", () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-public-source-"));
  const previousEipPath = process.env.EIP_OFFICIAL_REPO_PATH;
  const previousErcPath = process.env.ERC_OFFICIAL_REPO_PATH;
  try {
    const eipRoot = join(directory, "EIPs");
    const ercRoot = join(directory, "ERCs");
    mkdirSync(join(eipRoot, "EIPS"), { recursive: true });
    mkdirSync(join(ercRoot, "ERCS"), { recursive: true });
    process.env.EIP_OFFICIAL_REPO_PATH = eipRoot;
    process.env.ERC_OFFICIAL_REPO_PATH = ercRoot;

    const absentHtml = htmlForOfficialSourceFixture();
    assert.match(absentHtml, /https:\/\/ercs\.ethereum\.org\/ERCS\/erc-4626/);
    assertNoPublicPathLeakage(absentHtml, "official source absent fixture");
    const absentApi = embeddedPlatformApi(absentHtml);
    const absentFact = absentApi.intelligenceSnapshot.facts.specificationEvidence.find((fact: { proposalId?: string }) => fact.proposalId === "ERC-4626");
    assert.equal(absentFact.officialSourceState, "official_file_not_found");
    assert.equal(absentFact.officialSourcePath, undefined);

    writeFileSync(join(ercRoot, "ERCS", "erc-4626.md"), `---
eip: 4626
title: Tokenized Vaults
status: Final
---

# ERC-4626: Tokenized Vaults

## Abstract

This standard describes tokenized Vaults for a single underlying ERC-20 token.

## Specification

Vault implementations MUST expose deposit, mint, withdraw, and redeem flows.
`, { encoding: "utf8" });

    const presentHtml = htmlForOfficialSourceFixture();
    assert.match(presentHtml, /https:\/\/ercs\.ethereum\.org\/ERCS\/erc-4626/);
    assertNoPublicPathLeakage(presentHtml, "official source present fixture");
    const presentApi = embeddedPlatformApi(presentHtml);
    const presentFact = presentApi.intelligenceSnapshot.facts.specificationEvidence.find((fact: { proposalId?: string }) => fact.proposalId === "ERC-4626");
    assert.equal(presentFact.officialSourceState, "official_body_parsed");
    assert.equal(presentFact.officialSourcePath, undefined);
    assert.match(presentFact.abstractText, /tokenized Vaults/);
  } finally {
    if (previousEipPath === undefined) delete process.env.EIP_OFFICIAL_REPO_PATH;
    else process.env.EIP_OFFICIAL_REPO_PATH = previousEipPath;
    if (previousErcPath === undefined) delete process.env.ERC_OFFICIAL_REPO_PATH;
    else process.env.ERC_OFFICIAL_REPO_PATH = previousErcPath;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("builds proposal intelligence for domain watch, detail, timeline, and use-case evidence levels", () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-proposal-intel-"));
  const previousErcPath = process.env.ERC_OFFICIAL_REPO_PATH;
  const db = openDatabase(":memory:");
  try {
    const ercRoot = join(directory, "ERCs");
    mkdirSync(join(ercRoot, "ERCS"), { recursive: true });
    process.env.ERC_OFFICIAL_REPO_PATH = ercRoot;
    writeProposalSource(ercRoot, "ERC-9001", "Wallet Authorization Conditions", "Draft", "This proposal defines a wallet authorization interface for delegated transaction permissions.", "Wallets can verify authorization, nonce, and permission constraints through a shared interface.");
    writeProposalSource(ercRoot, "ERC-9002", "Wallet Authorization Baseline", "Final", "This standard describes a stable wallet authorization interface.", "The interface is final and does not imply production adoption.");
    writeProposalSource(ercRoot, "ERC-9004", "Wallet Implementation Hook", "Draft", "This proposal defines wallet hook interfaces for account permission checks.", "Implementations can track hook integration through repository PRs.");

    insertSnapshot(db, [
      makeRecord("ERC-9001", "Draft", "hash-9001", "Wallet Authorization Conditions", "ERC"),
      makeRecord("ERC-9002", "Final", "hash-9002", "Wallet Authorization Baseline", "ERC"),
      makeRecord("ERC-9004", "Draft", "hash-9004", "Wallet Implementation Hook", "ERC"),
    ]);
    const report = buildWeeklyReport(db, new Date("2026-08-10T00:00:00.000Z"));
    assert.ok(report);
    report.ethereumTechRadar.themeInsights.push({
      theme: "Wallet UX",
      proposalCount: 2,
      proposalCount180d: 2,
      recentChangeCount: 1,
      recentChangeCount7d: 1,
      discussionProposalCount: 1,
      contentChangeCount: 0,
      maturitySignal: "medium",
      momentumScore: 40,
      dominantSubTrends: [],
      representativeProposals: [
        { id: "ERC-9001", title: "Wallet Authorization Conditions", status: "Draft", oneLineSummary: "Wallet authorization fixture", canonicalUrl: "https://ercs.ethereum.org/ERCS/erc-9001" },
        { id: "ERC-9002", title: "Wallet Authorization Baseline", status: "Final", oneLineSummary: "Wallet authorization baseline fixture", canonicalUrl: "https://ercs.ethereum.org/ERCS/erc-9002" },
        { id: "ERC-9004", title: "Wallet Implementation Hook", status: "Draft", oneLineSummary: "Wallet implementation hook fixture", canonicalUrl: "https://ercs.ethereum.org/ERCS/erc-9004" },
      ],
      trendInterpretation: "Fixture wallet authorization trend.",
      interpretation: "Fixture wallet authorization trend.",
    });
    setReportEvents(report, [
      makeChangeEvent(1, "status-9001", {
        proposalId: "ERC-9001",
        type: "status_change",
        previousStatus: "Draft",
        currentStatus: "Review",
        sourceRepo: "ethereum/ercs",
        sourcePath: "ERCS/erc-9001.md",
        canonicalUrl: "https://ercs.ethereum.org/ERCS/erc-9001",
        changeSemanticType: "metadata_status",
        occurredAt: "2026-08-08T00:00:00.000Z",
        detectedAt: "2026-08-08T00:00:00.000Z",
        occurredAtSource: "git_commit",
        timestampConfidence: "high",
      }),
    ]);
    report.ethereumTechRadar.signalLayer.discussionHeat = [{
      proposalId: "ERC-9001",
      title: "Wallet Authorization Conditions",
      status: "Draft",
      theme: "Wallet UX",
      discussionUrl: "https://ethereum-magicians.org/t/wallet-authorization-conditions/9001",
      discussionLinks: ["https://ethereum-magicians.org/t/wallet-authorization-conditions/9001"],
      discussionScore: 80,
      discussionActivityScore: 90,
      discussionTopicId: 9001,
      discussionTitle: "Wallet Authorization Conditions",
      discussionSource: "Ethereum Magicians",
      discussionCreatedAt: "2026-08-01T00:00:00.000Z",
      discussionLastActivityAt: "2026-08-09T00:00:00.000Z",
      discussionReplyCount: 14,
      discussionParticipantCount: 5,
      discussionViewCount: 1000,
      discussionFreshnessDays: 1,
      discussionCollectionStatus: "posts_fully_collected",
      discussionFetchAttempted: true,
      postTimestampTrace: ["2026-08-09T00:00:00.000Z", "2026-08-09T01:00:00.000Z"],
      postsInCurrent7d: 2,
      postsInPrevious7d: 0,
      latestPostAuthors: ["alice", "bob"],
      activityLevel: "High",
      whyItMatters: "Recent public discussion activity exists.",
      canonicalUrl: "https://ercs.ethereum.org/ERCS/erc-9001",
    }];
    report.ethereumTechRadar.emergingLayer = {
      generatedAt: report.generatedAt,
      sourceStatus: [],
      rawSignals: [],
      issues: [{
        issueId: "proposal:ERC-9003",
        title: "Wallet authorization pre-merge discussion",
        primaryProposalId: "ERC-9003",
        relatedProposalIds: [],
        eipIds: ["ERC-9003"],
        status: "EARLY_SIGNAL",
        stage: "PRE_MERGE",
        heatScore: 44,
        confidenceScore: 61,
        sources: ["ethereum_magicians"],
        metrics: { replyCount: 5, viewCount: 300, participantCount: 3, velocity: [] },
        scoreBreakdown: [],
        sourceSignals: [{ source: "ethereum_magicians", sourceId: "pre-9003", url: "https://ethereum-magicians.org/t/pre-merge-wallet-authorization/9003", title: "Wallet authorization pre-merge discussion", primaryProposalId: "ERC-9003", relatedProposalIds: [], extractedEipIds: ["ERC-9003"], collectedAt: report.generatedAt, facts: {} }],
        summaries: { whatIsHappening: "공식 문서 전 단계의 Magicians 논의입니다.", whyMoving: "최근 토론 후보입니다.", whyItMatters: "공식 repository 반영 여부를 봐야 합니다.", watchNext: "공식 문서 반영 여부" },
        facts: {},
      }, {
        issueId: "proposal:ERC-9004",
        title: "Wallet implementation hook PR",
        primaryProposalId: "ERC-9004",
        relatedProposalIds: [],
        eipIds: ["ERC-9004"],
        status: "IMPLEMENTATION_WATCH",
        stage: "IMPLEMENTATION",
        heatScore: 58,
        confidenceScore: 70,
        sources: ["github_pr"],
        metrics: { velocity: [] },
        scoreBreakdown: [],
        sourceSignals: [{ source: "github_pr", sourceId: "ethereum/ercs#9004", sourceRepo: "ethereum/ercs", url: "https://github.com/ethereum/ercs/pull/9004", title: "Wallet implementation hook PR", primaryProposalId: "ERC-9004", relatedProposalIds: [], extractedEipIds: ["ERC-9004"], collectedAt: report.generatedAt, facts: {} }],
        summaries: { whatIsHappening: "GitHub PR 활동이 확인됩니다.", whyMoving: "PR 업데이트가 있습니다.", whyItMatters: "구현 추적과 채택을 분리해야 합니다.", watchNext: "PR merge 여부" },
        facts: {},
      }],
      whatsHappeningNow: [],
      emergingSignals: [],
      decisionWatch: [],
      generatedBy: "deterministic_emerging_signal_engine",
    };
    report.ethereumTechRadar.adoptionLayer = {
      generatedBy: "deterministic",
      collectionStatus: "collected",
      items: [{
        proposalId: "ERC-9004",
        title: "Wallet Implementation Hook",
        theme: "Wallet UX",
        evidenceLevel: "Implementation",
        evidenceScore: 80,
        summary: "Implementation tracking evidence exists.",
        caution: "Not production adoption.",
        sources: [{ sourceType: "github_pr", semanticType: "client_implementation_pr", relationship: "direct", url: "https://github.com/example/wallet/pull/9004", title: "Track ERC-9004 hook", state: "open", evidenceKind: "implementation", evidenceId: "impl:ERC-9004:pr" }],
      }],
    };

    const html = generateWeeklyHtml(report);
    const api = embeddedPlatformApi(html);
    const model = api.intelligenceSnapshot.views.dashboardV2.proposalIntelligence;
    const domain = model.domains.find((item: { proposalIds: string[] }) => item.proposalIds.includes("ERC-9001"));
    assert.ok(domain);
    assert.equal(domain.watchItems[0].proposalId, "ERC-9001");
    const baselineDomain = model.domains.find((item: { proposalIds: string[] }) => item.proposalIds.includes("ERC-9002"));
    assert.ok(baselineDomain);
    assert.ok(baselineDomain.watchItems.some((item: { proposalId: string; rankLabel: string }) => item.proposalId === "ERC-9002" && item.rankLabel === "BASELINE"));
    assert.ok(domain.timeline.some((item: { proposalId: string; activityType: string }) => item.proposalId === "ERC-9001" && item.activityType === "STATUS_CHANGED"));
    assert.ok(domain.timeline.some((item: { proposalId: string; activityType: string }) => item.proposalId === "ERC-9004" && item.activityType === "GITHUB_PR_ACTIVITY"));

    const active = model.proposals.find((item: { proposalId: string }) => item.proposalId === "ERC-9001");
    assert.ok(active);
    assert.match(active.simpleSummary, /권한|계정|트랜잭션|지갑/);
    assert.match(active.statusExplanation, /Draft|초기 단계/);
    assert.ok(active.useCases.some((item: { evidenceLevel: string; areaKo: string }) => item.evidenceLevel === "SPECIFICATION_POTENTIAL" && item.areaKo === "Wallet"));

    const implementation = model.proposals.find((item: { proposalId: string }) => item.proposalId === "ERC-9004");
    assert.ok(implementation);
    assert.ok(implementation.useCases.some((item: { evidenceLevel: string }) => item.evidenceLevel === "IMPLEMENTATION_TRACKED"));
    assert.doesNotMatch(JSON.stringify(implementation), /실제 활용 확인|현재 활용됨/);

    const premerge = model.proposals.find((item: { proposalId: string }) => item.proposalId === "ERC-9003");
    assert.ok(premerge);
    assert.ok(premerge.sourceActions.some((item: { labelKo: string }) => item.labelKo === "Ethereum Magicians"));
    assert.ok(!premerge.sourceActions.some((item: { labelKo: string }) => item.labelKo === "공식 문서"));
    assert.doesNotMatch(JSON.stringify(premerge), /ercs\.ethereum\.org\/ERCS\/erc-9003/);

    assert.match(html, /관찰 중 Proposal|최근 명세 활동|설명 보기/);
    assertNoPublicPathLeakage(html, "proposal intelligence fixture");
  } finally {
    db.close();
    if (previousErcPath === undefined) delete process.env.ERC_OFFICIAL_REPO_PATH;
    else process.env.ERC_OFFICIAL_REPO_PATH = previousErcPath;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("preflight diagnostics allow external emerging drafts but block real specification failures", () => {
  const diagnostics = __qualityTestHooks.specificationPreflightDiagnostics(
    ["EIP-9001", "EIP-9002", "EIP-8037", "EIP-9004", "topic:magicians:77", "EIP-9006"],
    [
      {
        proposalId: "EIP-9001",
        parseState: "title_only",
        officialSourceState: "official_file_not_found",
        sourceUrl: "https://ethereum-magicians.org/t/example/9001",
      },
      {
        proposalId: "EIP-9002",
        parseState: "title_only",
        officialSourceState: "official_file_not_found",
        sourceUrl: "https://github.com/ethereum/EIPs/pull/9002",
      },
      {
        proposalId: "EIP-8037",
        parseState: "title_only",
        officialSourceState: "official_file_title_only",
      },
      {
        proposalId: "EIP-9004",
        parseState: "fetch_failed",
        officialSourceState: "official_file_parse_failed",
      },
      {
        proposalId: "topic:magicians:77",
        parseState: "title_only",
        officialSourceState: "external_source_only",
        sourceUrl: "https://ethereum-magicians.org/t/unnumbered-topic/77",
      },
      {
        proposalId: "EIP-9006",
        parseState: "body_parsed",
        officialSourceState: "official_body_parsed",
      },
    ],
  );

  assert.deepEqual(diagnostics.officialMissingWithFallbackIds, ["EIP-9001", "EIP-9002"]);
  assert.deepEqual(diagnostics.externalSourceOnlyIds, ["topic:magicians:77"]);
  assert.deepEqual(diagnostics.bodyParsedIds, ["EIP-9006"]);
  assert.deepEqual(diagnostics.officialTitleOnlyIds, ["EIP-8037"]);
  assert.deepEqual(diagnostics.parseFailedIds, ["EIP-9004"]);
  assert.deepEqual(diagnostics.requiredBodyTitleOnlyIds, ["EIP-8037"]);
  assert.deepEqual(diagnostics.blockingIds, ["EIP-8037", "EIP-9004"]);
});

test("preflight diagnostics keep missing specification evidence as an integrity failure input", () => {
  const diagnostics = __qualityTestHooks.specificationPreflightDiagnostics(
    ["EIP-9010", "topic:magicians:missing"],
    [
      {
        proposalId: "EIP-9010",
        parseState: "title_only",
        officialSourceState: "official_file_not_found",
      },
    ],
  );

  assert.deepEqual(diagnostics.officialMissingWithFallbackIds, ["EIP-9010"]);
  assert.deepEqual(diagnostics.missingEvidenceIds, ["topic:magicians:missing"]);
  assert.deepEqual(diagnostics.blockingIds, []);
});

test("applies exact golden fixtures only when reportAsOf and input hash match", () => {
  const fixtureA = canonicalQualityFixture({
    reportAsOf: "2026-07-31T00:00:00.000Z",
    postCount: 32,
    threadCount: 6,
    topProposals: ["ERC-8183", "EIP-8037", "EIP-8151"],
    technologyMapPostCount: 5,
  });
  const fixtureB = canonicalQualityFixture({
    reportAsOf: "2026-07-31T19:00:00.000Z",
    postCount: 13,
    threadCount: 5,
    topProposals: ["EIP-8037", "EIP-8151", "ERC-8330"],
    technologyMapPostCount: 5,
  });

  for (const fixture of [fixtureA, fixtureB]) {
    assert.equal(__qualityTestHooks.finalDeveloperActivityCanonicalConsistency(fixture.embeddedApi, fixture.visibleHtml), true);
    assert.equal(__qualityTestHooks.finalTechnologyMapCanonicalConsistency(fixture.embeddedApi, fixture.visibleHtml), true);
    assert.equal(__qualityTestHooks.aaNonAaRegression(fixture.embeddedApi), true);
    assert.equal(__qualityTestHooks.finalGoldenFixtureDateScope(fixture.embeddedApi), true);
  }

  const dateOnly = canonicalQualityFixture({
    reportAsOf: "2026-07-31T12:34:56.000Z",
    postCount: 32,
    threadCount: 6,
    topProposals: ["ERC-8183", "EIP-8037", "EIP-8151"],
    technologyMapPostCount: 5,
    inputSnapshotHash: "date-only-is-not-enough",
  });
  assert.equal(__qualityTestHooks.finalGoldenFixtureDateScope(dateOnly.embeddedApi), null);
  assert.match(__qualityTestHooks.finalGoldenObserved(dateOnly.embeddedApi), /status=not_applicable/);
  assert.match(__qualityTestHooks.finalGoldenExpected(dateOnly.embeddedApi), /matching reportDate \+ reportAsOf \+ inputSnapshotHash fixture/);
});

test("quality check not_applicable serializes as parseable UTF-8 JSON", () => {
  const check = __qualityTestHooks.qualityCheck(
    "final-f01-golden-fixture-date-scope",
    null,
    "fail",
    "live rolling snapshot; no matching frozen fixture · 한국어 유지",
    "matching reportDate + reportAsOf + inputSnapshotHash fixture",
  );
  const json = JSON.stringify({ passed: true, checks: [check] }, null, 2);
  const parsed = JSON.parse(json);

  assert.equal(parsed.checks[0].status, "not_applicable");
  assert.equal(parsed.checks[0].passed, null);
  assert.equal(parsed.checks[0].failureReason, "");
  assert.match(json, /한국어 유지/);
  assert.doesNotMatch(json, /\bundefined\b/);
});

test("discussion language quality rejects raw low-information discussion text without flagging metrics or titles", () => {
  const publicDiscussion = `
    <article>
      <h3>EIP-8363: Tapered Issuance Burn</h3>
      <dl><div><dt>24h replies</dt><dd>+1</dd></div></dl>
      <p><b>What's happening</b>Magicians에서 EIP-8363 관련 activity가 포착됐습니다.</p>
      <small>7일 조회 +1</small>
    </article>
  `;
  const rawCopiedPost = `<article><p>Sorry, more my stupid question then</p></article>`;

  assert.equal(__qualityTestHooks.discussionLanguageRenderingClean(publicDiscussion), true);
  assert.equal(__qualityTestHooks.discussionLanguageRenderingClean(rawCopiedPost), false);
});

test("discussion validity quality keeps unclassified raw activity separate from valid technical counts", () => {
  const unclassified = {
    intelligenceSnapshot: {
      views: {
        developerAttention: {
          summary: { rawPosts: 4, validTechnicalPosts: null, validatedInsights: 0 },
          activity: [{ proposalId: "topic:wallets", rawPostCount: 4, validTechnicalPostCount: null, analyzedInsightCount: 0 }],
        },
        dataQuality: {
          discussionRelevance: "unclassified",
          discussionCollection: { recent7dPostCount: 4, analyzedPostCount: 0, validTechnicalPostCount: null },
        },
      },
    },
  };
  const copiedRawAsValid = {
    intelligenceSnapshot: {
      views: {
        developerAttention: {
          summary: { rawPosts: 4, validTechnicalPosts: 4, validatedInsights: 0 },
          activity: [{ proposalId: "topic:wallets", rawPostCount: 4, validTechnicalPostCount: 4, analyzedInsightCount: 0 }],
        },
        dataQuality: {
          discussionRelevance: "unclassified",
          discussionCollection: { recent7dPostCount: 4, analyzedPostCount: 0, validTechnicalPostCount: 4 },
        },
      },
    },
  };

  assert.equal(__qualityTestHooks.discussionValidityClassification(unclassified), true);
  assert.equal(__qualityTestHooks.discussionValidityClassification(copiedRawAsValid), false);
});

test("public claim source quality preserves nullable source date slots", () => {
  const sourcedClaim = {
    intelligenceSnapshot: {
      views: {
        focusProgress: [{
          topicId: "wallet-authorization-evolution",
          evidenceClaims: [{
            verified: true,
            sourceUrls: ["https://eips.ethereum.org/EIPS/eip-8141", "https://ercs.ethereum.org/ERCS/erc-7562"],
            sourceDates: ["2026-05-12T12:05:10-05:00", null],
          }],
        }],
      },
    },
  };
  const missingSourceDateSlot = {
    intelligenceSnapshot: {
      views: {
        focusProgress: [{
          topicId: "wallet-authorization-evolution",
          evidenceClaims: [{
            verified: true,
            sourceUrls: ["https://eips.ethereum.org/EIPS/eip-8141", "https://ercs.ethereum.org/ERCS/erc-7562"],
            sourceDates: ["2026-05-12T12:05:10-05:00"],
          }],
        }],
      },
    },
  };

  assert.equal(__qualityTestHooks.allClaimsHaveSources(sourcedClaim), true);
  assert.equal(__qualityTestHooks.allClaimsHaveSources(missingSourceDateSlot), false);
});

test("subject registry check reports actual missing public IDs", () => {
  const embeddedApi = {
    intelligenceSnapshot: {
      monitoringUniverse: { subjectRegistry: [{ proposalId: "ERC-1" }] },
      views: {
        developerAttention: { activity: [{ proposalId: "ERC-1" }] },
        accountAbstraction: { tracks: [{ baselineProposals: [{ subjectId: "ERC-8286" }] }] },
        kgldWatch: { groups: { research_now: [{ proposalId: "ERC-8330" }], monitor: [], no_action: [] } },
      },
    },
  };

  assert.deepEqual(__qualityTestHooks.subjectRegistryMissingIdsFromPublicViews(embeddedApi), ["ERC-8286", "ERC-8330"]);
});

test("weekly signal copy handles empty, single, multiple, and non-ranking modes", () => {
  const fixtures = [
    { usableCount: 0, rawCount: 0, weeklyRankingValidity: "invalid", mode: "empty", rankingEnabled: false, value: "0건", summary: "최근 7일 확인 가능한 의미 변화가 없습니다." },
    { usableCount: 1, rawCount: 1, weeklyRankingValidity: "valid", mode: "single", rankingEnabled: false, value: "1건", summary: "최근 7일 확인된 의미 변화는 1건입니다." },
    { usableCount: 1, rawCount: 27, weeklyRankingValidity: "invalid", mode: "non_ranking", rankingEnabled: false, value: "1건", summary: "최근 7일 확인된 의미 변화는 1건입니다. 데이터 품질 기준에 따라 주간 순위는 제공하지 않습니다." },
    { usableCount: 2, rawCount: 2, weeklyRankingValidity: "valid", mode: "multiple", rankingEnabled: true, value: "2건", summary: "최근 7일 확인된 의미 변화는 2건입니다." },
    { usableCount: 5, rawCount: 27, weeklyRankingValidity: "invalid", mode: "non_ranking", rankingEnabled: false, value: "5건", summary: "최근 7일 확인된 의미 변화는 5건입니다. 데이터 품질 기준에 따라 주간 순위는 제공하지 않습니다." },
    { usableCount: 5, rawCount: 5, weeklyRankingValidity: "valid", mode: "multiple", rankingEnabled: true, value: "5건", summary: "최근 7일 확인된 의미 변화는 5건입니다." },
  ] as const;

  for (const fixture of fixtures) {
    const copy = __qualityTestHooks.buildWeeklySignalCopy(fixture);
    assert.equal(copy.metricLabel, "확인된 주간 신호");
    assert.equal(copy.metricValue, fixture.value);
    assert.equal(copy.summaryText, fixture.summary);
    assert.equal(copy.mode, fixture.mode);
    assert.equal(copy.rankingEnabled, fixture.rankingEnabled);
  }
});

test("weekly signal canonical view drives Cover, Executive Pulse, and quality check", () => {
  const fixtures = [
    { usableCount: 0, rawCount: 0, mode: "empty", rankingEnabled: false },
    { usableCount: 1, rawCount: 1, mode: "single", rankingEnabled: false },
    { usableCount: 1, rawCount: 27, mode: "non_ranking", rankingEnabled: false },
    { usableCount: 2, rawCount: 2, mode: "multiple", rankingEnabled: true },
    { usableCount: 5, rawCount: 27, mode: "non_ranking", rankingEnabled: false },
    { usableCount: 5, rawCount: 5, mode: "multiple", rankingEnabled: true },
  ] as const;

  for (const fixture of fixtures) {
    const { report, html, visibleHtml, api } = weeklySignalScenario(fixture.usableCount, fixture.rawCount);
    const dashboard = api.intelligenceSnapshot.views;
    const copy = dashboard.weeklySignalCopy;

    assert.equal(copy.metricLabel, "확인된 주간 신호");
    assert.equal(copy.metricValue, `${fixture.usableCount}건`);
    assert.equal(copy.mode, fixture.mode);
    assert.equal(copy.rankingEnabled, fixture.rankingEnabled);
    assert.match(visibleHtml, new RegExp(`<div data-weekly-signal-cover-metric><span>확인된 주간 신호</span><b>${fixture.usableCount}건</b></div>`));
    assert.match(visibleHtml, new RegExp(`<b data-executive-weekly-usable>${fixture.usableCount}건</b>`));
    assert.match(visibleHtml, new RegExp(`data-weekly-signal-mode="${fixture.mode}"`));
    assert.equal(dashboard.dataQuality.current7dUsableEventCount, fixture.usableCount);
    assert.match(visibleHtml, new RegExp(`data-landscape-weekly-usable>최근 7일 의미 변화 합계 ${fixture.usableCount}건</p>`));
    assert.equal(api.intelligenceSnapshot.aggregates.weeklyQuality.find((metric: { metricId: string }) => metric.metricId === "weekly.usableEvents")?.value, fixture.usableCount);
    assert.equal(__qualityTestHooks.coverSingularPluralConsistency(report, api, visibleHtml), true);
    assert.notDeepEqual(__qualityTestHooks.coverSingularPluralAffectedIds(api), []);
    assert.match(__qualityTestHooks.coverSingularPluralObserved(api, visibleHtml), /"usableCount":/);

    if (!fixture.rankingEnabled) {
      assert.doesNotMatch(visibleHtml, /Top signals|상위 신호|이번 주 주요 개발 주제/);
    }
    if (fixture.usableCount > 0) {
      assert.doesNotMatch(visibleHtml, /data-weekly-signal-cover-metric><span>확인된 주간 신호<\/span><b>0건<\/b>/);
    }
    void html;
  }
});

test("weekly signal quality check rejects stale ranking and count renderings", () => {
  const single = weeklySignalScenario(1, 1);
  assert.equal(__qualityTestHooks.coverSingularPluralConsistency(single.report, single.api, single.visibleHtml.replace("data-weekly-signal-ranking=\"false\"", "data-weekly-signal-ranking=\"true\"")), false);
  assert.equal(__qualityTestHooks.coverSingularPluralConsistency(single.report, single.api, single.visibleHtml.replace("확인된 주간 신호", "상위 신호")), false);

  const invalid = weeklySignalScenario(5, 27);
  assert.equal(__qualityTestHooks.coverSingularPluralConsistency(invalid.report, invalid.api, invalid.visibleHtml.replace("data-weekly-signal-mode=\"non_ranking\"", "data-weekly-signal-mode=\"multiple\"")), false);
  assert.equal(__qualityTestHooks.coverSingularPluralConsistency(invalid.report, invalid.api, invalid.visibleHtml.replace("<div data-weekly-signal-cover-metric><span>확인된 주간 신호</span><b>5건</b></div>", "<div data-weekly-signal-cover-metric><span>확인된 주간 신호</span><b>0건</b></div>")), false);
  assert.equal(__qualityTestHooks.coverSingularPluralConsistency(invalid.report, invalid.api, invalid.visibleHtml.replace("data-weekly-signal-usable=\"5\"", "data-weekly-signal-usable=\"4\"")), false);

  const observed = __qualityTestHooks.coverSingularPluralObserved(invalid.api, invalid.visibleHtml);
  assert.match(observed, /"renderedCoverLabel":/);
  assert.match(observed, /"renderedCoverSummary":/);
  assert.notDeepEqual(__qualityTestHooks.coverSingularPluralAffectedIds(invalid.api), []);
});

test("weekly usable event gating preserves raw facts but excludes unknown fallback and low confidence signals", () => {
  const db = openDatabase(":memory:");

  try {
    insertSnapshot(db, [makeRecord()]);
    const report = buildWeeklyReport(db, new Date("2026-06-12T12:00:00.000Z"));
    assert.ok(report);

    const events = [
      makeChangeEvent(1, "git-unknown", {
        changeSemanticType: "unknown",
        occurredAtSource: "git_commit",
        timestampConfidence: "high",
      }),
      makeChangeEvent(2, "fallback-normal", {
        changeSemanticType: "normative_specification",
        occurredAtSource: "fallback_detected_at",
        timestampConfidence: "low",
      }),
      makeChangeEvent(3, "git-normal", {
        changeSemanticType: "normative_specification",
        occurredAtSource: "git_commit",
        timestampConfidence: "high",
      }),
      makeChangeEvent(4, "git-low-confidence", {
        changeSemanticType: "interface_or_api",
        occurredAtSource: "git_commit",
        timestampConfidence: "high",
        confidence: 0.4,
      } as Partial<ChangeEvent> & { confidence: number }),
    ];
    setReportEvents(report, events);

    const html = generateWeeklyHtml(report);
    const api = JSON.parse(html.match(/<script type="application\/json" id="technology-platform-api">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
    const snapshot = api.intelligenceSnapshot;
    const facts = snapshot.facts.developmentEvents;
    const usableEventIds = snapshot.views.dataQuality.usableEventIds;
    const expectedUsableId = eventKey(events[2]!);

    assert.deepEqual(usableEventIds, [expectedUsableId]);
    assert.equal(snapshot.views.dataQuality.current7dUsableEventCount, 1);
    assert.ok(facts.length >= events.length);
    assert.ok(facts.some((event: { eventId: string; semanticType: string }) => event.eventId === eventKey(events[0]!) && event.semanticType === "unknown"));
    assert.ok(facts.some((event: { eventId: string; occurredAtSource: string }) => event.eventId === eventKey(events[1]!) && event.occurredAtSource === "fallback_detected_at"));
    assert.ok(!usableEventIds.includes(eventKey(events[0]!)));
    assert.ok(!usableEventIds.includes(eventKey(events[1]!)));
    assert.ok(!usableEventIds.includes(eventKey(events[3]!)));

    const landscapeIds = new Set(snapshot.views.technologyLandscape.flatMap((domain: { weeklyUsableEventIds?: string[] }) => domain.weeklyUsableEventIds ?? []));
    const focusIds = new Set(snapshot.views.focusProgress.flatMap((topic: { weeklyUsableEventIds?: string[] }) => topic.weeklyUsableEventIds ?? []));
    const compactIds = new Set(snapshot.aggregates.weeklyQuality.find((metric: { metricId: string }) => metric.metricId === "weekly.usableEvents") ? usableEventIds : []);
    assert.deepEqual([...landscapeIds].sort(), usableEventIds);
    assert.deepEqual([...focusIds].sort(), usableEventIds);
    assert.deepEqual([...compactIds].sort(), usableEventIds);
  } finally {
    db.close();
  }
});

test("weekly confidence limit reason uses canonical usable and raw counts when ranking is invalid", () => {
  const db = openDatabase(":memory:");

  try {
    insertSnapshot(db, [makeRecord()]);
    const report = buildWeeklyReport(db, new Date("2026-06-12T12:00:00.000Z"));
    assert.ok(report);

    const usable = Array.from({ length: 5 }, (_, index) => makeChangeEvent(index + 1, `usable-${index + 1}`, {
      changeSemanticType: "normative_specification",
      occurredAtSource: "git_commit",
      timestampConfidence: "high",
    }));
    const unusable = Array.from({ length: 22 }, (_, index) => makeChangeEvent(index + 101, `unusable-${index + 1}`, {
      changeSemanticType: "unknown",
      occurredAtSource: "fallback_detected_at",
      timestampConfidence: "low",
    }));
    setReportEvents(report, [...usable, ...unusable]);

    const html = generateWeeklyHtml(report);
    const visibleHtml = visibleReportHtml(html);
    const api = JSON.parse(html.match(/<script type="application\/json" id="technology-platform-api">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
    const dashboard = api.intelligenceSnapshot.views;
    const expectedReason = "최근 7일 usable event는 5/27건이며, 데이터 품질 기준에 따라 주간 순위는 비활성화했습니다.";
    const expectedPublicReason = "최근 7일 분석 반영 이벤트는 5/27건이며, 데이터 품질 기준에 따라 변화 강도 비교는 제공하지 않습니다.";

    assert.equal(dashboard.dataQuality.current7dRawEventCount, 27);
    assert.equal(dashboard.dataQuality.current7dUsableEventCount, 5);
    assert.equal(dashboard.dataQuality.weeklyRankingValidity, "invalid");
    assert.equal(dashboard.executivePulse.confidenceLimits.find((item: { label: string }) => item.label === "Weekly specification trend")?.reason, expectedReason);
    assert.match(visibleHtml, new RegExp(expectedPublicReason));
    assert.doesNotMatch(visibleHtml, /usable event가 0건입니다/);
    assert.equal(__qualityTestHooks.weeklyConfidenceLimitCanonical(api, visibleHtml), true);
  } finally {
    db.close();
  }
});

test("current-window-fallback-ratio passes when high-ratio fallback events are isolated from core views", () => {
  const scenario = weeklySignalScenario(17, 28);
  const ratio = 11 / 28;
  scenario.report.ethereumTechRadar.historicalInputDiagnostics = {
    ...(scenario.report.ethereumTechRadar.historicalInputDiagnostics ?? {}),
    timestampQuality: {
      ...(scenario.report.ethereumTechRadar.historicalInputDiagnostics?.timestampQuality ?? {}),
      current7dFallbackRatio: ratio,
    },
  } as WeeklyRadarReport["ethereumTechRadar"]["historicalInputDiagnostics"];

  assert.equal(__qualityTestHooks.currentWindowFallbackHandled(scenario.report, scenario.api), true);
  assert.match(__qualityTestHooks.currentWindowFallbackObserved(scenario.report, scenario.api), /"ratio":0\.39285714285714285/);
  assert.match(__qualityTestHooks.currentWindowFallbackObserved(scenario.report, scenario.api), /"usableEventIds":\[\]/);
  assert.match(__qualityTestHooks.currentWindowFallbackObserved(scenario.report, scenario.api), /"overviewEventIds":\[\]/);
  assert.match(__qualityTestHooks.currentWindowFallbackObserved(scenario.report, scenario.api), /"timelineEventIds":\[\]/);
  assert.match(__qualityTestHooks.currentWindowFallbackObserved(scenario.report, scenario.api), /"topicMapEventIds":\[\]/);
  assert.match(__qualityTestHooks.currentWindowFallbackObserved(scenario.report, scenario.api), /"explorerWeeklyEventIds":\[\]/);
});

test("AA advancing without current qualifying evidence is rendered as stable and passes both AA direction gates", () => {
  const db = openDatabase(":memory:");
  try {
    insertSnapshot(db, [makeRecord()]);
    const report = buildWeeklyReport(db, new Date("2026-06-12T12:00:00.000Z"));
    assert.ok(report);
    setReportEvents(report, []);
    report.ethereumTechRadar.trendChanges!.contentHashChanges = [
      makeChangeEvent(8141, "older-aa", {
        proposalId: "EIP-8141",
        sourcePath: "EIPS/eip-8141.md",
        canonicalUrl: "https://eips.ethereum.org/EIPS/eip-8141",
        occurredAt: "2026-05-25T00:00:00.000Z",
        detectedAt: "2026-05-25T00:00:00.000Z",
        changeSemanticType: "normative_specification",
        occurredAtSource: "git_commit",
        timestampConfidence: "high",
      }),
    ];

    const html = generateWeeklyHtml(report);
    const api = JSON.parse(html.match(/<script type="application\/json" id="technology-platform-api">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
    const track = api.intelligenceSnapshot.views.accountAbstraction.tracks.find((item: { proposalIds: string[] }) => item.proposalIds.includes("EIP-8141"));

    assert.equal(track.direction, "stable");
    assert.equal(track.specification30d.value, 1);
    assert.equal(track.specification7d.value, 0);
    assert.equal(__qualityTestHooks.aaDirectionEvidenceValid(api), true);
    assert.equal(__qualityTestHooks.aaDirectionEvidenceV2(api), true);
  } finally {
    db.close();
  }
});

test("monitoring scope count and wording are data-driven for current and rolling counts", () => {
  for (const fixture of [
    { discovered: 83, publicCount: 77, excluded: 6, monitored: 26, cards: 3 },
    { discovered: 91, publicCount: 82, excluded: 9, monitored: 29, cards: 4 },
  ]) {
    const api = monitoringScopeApi(fixture);
    const sentence = `총 ${fixture.discovered}건의 EIP/ERC Proposal을 발견했고, 이 중 ${fixture.publicCount}건을 주간 탐색과 진행 단계 분포 대상으로 선정했습니다. 탐색 대상에서 제외한 기준 Proposal은 ${fixture.excluded}건입니다. 이 중 ${fixture.monitored}건을 주간 집중 모니터링하며, 최근 활동을 상세 표시한 Proposal은 ${fixture.cards}건입니다.`;
    const html = `<div class="dash-scope-summary"><p>${sentence}</p><dl><dt>발견 대상</dt><dd>${fixture.discovered}건</dd><dt>탐색·단계 분포 대상</dt><dd>${fixture.publicCount}건</dd><dt>기준 Proposal</dt><dd>${fixture.excluded}건</dd><dt>집중 모니터링</dt><dd>${fixture.monitored}건</dd><dt>상세 활동 카드</dt><dd>${fixture.cards}건</dd></dl></div>`;

    assert.equal(__qualityTestHooks.monitoringScopeReferenceCount(api), true);
    assert.equal(__qualityTestHooks.monitoringScopeWording(api, html), true);
  }
});

test("Vitalik facts do not change core projection and usable count one remains valid", () => {
  const scenario = weeklySignalScenario(1, 1);
  const snapshot = scenario.api.intelligenceSnapshot;
  snapshot.facts.vitalikBlogPosts = [{
    factId: "vitalik:post-1",
    sourceUrl: "https://vitalik.eth.limo/example.html",
    publishedAt: "2026-06-10",
    title: "Example",
  }];
  snapshot.views.vitalikBlog = { selectedPosts: [{ factId: "vitalik:post-1" }] };

  assert.deepEqual(
    __qualityTestHooks.coreProjection(snapshot),
    __qualityTestHooks.coreProjection(__qualityTestHooks.snapshotWithoutVitalik(snapshot)),
  );
  assert.equal(__qualityTestHooks.vitalikNoCoreMetricContamination(scenario.api), true);
  assert.equal(snapshot.views.dashboardV2.overview.weeklyUsableCount.value, 1);
  assert.equal(snapshot.views.dashboardV2.weeklyTimeline.totalUsableCount, 1);
  assert.equal(snapshot.views.dashboardV2.topicActivityMap.totalCurrent7d, 1);
  assert.equal(snapshot.views.dashboardV2.proposalExplorer.totalCurrent7d, 1);
});

test("weekly summary language check allows official English terms with Korean prose", () => {
  assert.equal(
    __qualityTestHooks.weeklySummaryTextQuality("해당 Proposal은 공식 원문 기준 계정·권한 및 EVM 실행 규칙 영역을 다루는 제안입니다. 구현·채택 여부는 이번 수집 범위에서 확인하지 않았습니다."),
    true,
  );
  assert.equal(
    __qualityTestHooks.weeklySummaryTextQuality("EIP ID와 Ethereum, EVM opcode/API를 포함하지만 설명 문장은 한국어로 제공합니다."),
    true,
  );
});

test("weekly summary language check rejects raw English abstract, markdown, and truncation", () => {
  assert.equal(
    __qualityTestHooks.weeklySummaryTextQuality("This proposal defines a standard interface for account validation in the Ethereum Virtual Machine and introduces a new opcode for contract execution."),
    false,
  );
  assert.equal(__qualityTestHooks.weeklySummaryTextQuality("## Heading\n- [text](https://example.test)를 원문 그대로 노출합니다."), false);
  assert.equal(__qualityTestHooks.weeklySummaryTextQuality("EIP-8368은 공식 원문 기준 계정·권한 관련 규칙을 다루는 제안입..."), false);
});

test("weekly summary language checks body separately from official title and proposal id", () => {
  const api = weeklySummaryApi({
    proposalId: "EIP-8372",
    title: "Normalized state gas limit",
    summary: "해당 Proposal은 공식 원문 기준 실행·상태 영역을 다루는 제안입니다. 구현·채택 여부는 이번 수집 범위에서 확인하지 않았습니다.",
  });
  const html = `<button data-weekly-repository-addition><span>EIP-8372</span><strong>Normalized state gas limit</strong><small>해당 Proposal은 공식 원문 기준 실행·상태 영역을 다루는 제안입니다. 구현·채택 여부는 이번 수집 범위에서 확인하지 않았습니다.</small></button>`;

  assert.deepEqual(__qualityTestHooks.weeklySummaryLanguageAffectedIds(api, html), []);
  assert.equal(__qualityTestHooks.weeklySummaryLanguageDiagnostics(api, html)[0].passed, true);
});

test("weekly summary language allows technical nouns but rejects taxonomy phrases and raw body", () => {
  assert.equal(__qualityTestHooks.weeklySummaryTextQuality("해당 Proposal은 EVM opcode/API와 gas 규칙을 다루며, 설명 문장은 한국어로 제공합니다."), true);
  assert.equal(__qualityTestHooks.weeklySummaryTextQuality("해당 Proposal은 공식 원문 기준 oracle/reporting 영역을 다루는 제안입니다."), false);
  assert.equal(__qualityTestHooks.weeklySummaryTextQuality("해당 Proposal은 공식 원문 기준 execution-state 영역을 다루는 제안입니다."), false);
  assert.equal(__qualityTestHooks.weeklySummaryTextQuality("This proposal normalizes state gas limit handling and defines EVM behavior for oracle reporting integrations across clients."), false);
});

test("weekly summary generation falls back to neutral Korean when evidence is thin", () => {
  const summary = __qualityTestHooks.proposalSummaryForV3({
    proposalId: "EIP-9001",
    title: "Sparse Official Title",
    eventType: "new_proposal",
    description: "Proposal file creation detected.",
  } as never);

  assert.doesNotMatch(summary, /EIP-9001 Sparse Official Title/);
  assert.match(summary, /공식 저장소에 신규 반영됐습니다/);
  assert.equal(__qualityTestHooks.weeklySummaryTextQuality(summary), true);
});

test("known-domain runtime fixtures ignore rolling-window exclusions but keep classifier invariant", () => {
  assert.equal(__qualityTestHooks.knownDomainClassifierRegression(), true);

  const inside = knownDomainApi([
    { proposalId: "EIP-8151", domainId: "accounts-wallets" },
    { proposalId: "EIP-8198", domainId: "validators-consensus" },
  ]);
  assert.equal(__qualityTestHooks.knownDomainSemanticFixtures(inside), true);
  assert.equal(__qualityTestHooks.knownDomainSemanticFixturesV4(inside), true);

  const agedOut = knownDomainApi([
    { proposalId: "EIP-8198", domainId: "validators-consensus" },
  ], ["EIP-8151"]);
  assert.equal(__qualityTestHooks.knownDomainSemanticFixtures(agedOut), true);
  assert.deepEqual(__qualityTestHooks.knownDomainRuntimeMismatches(agedOut), []);

  const sourceOnly = knownDomainApi([], ["EIP-8151"]);
  assert.equal(__qualityTestHooks.knownDomainSemanticFixtures(sourceOnly), true);
  assert.equal(__qualityTestHooks.knownDomainClassifierRegression(), true);
});

test("known-domain runtime fixtures fail current Explorer domain mismatch across dates", () => {
  const wrong = knownDomainApi([
    { proposalId: "EIP-8151", domainId: "interoperability" },
  ], [], "2026-08-17T00:00:00.000Z");

  assert.equal(__qualityTestHooks.knownDomainSemanticFixtures(wrong), false);
  assert.deepEqual(__qualityTestHooks.knownDomainRuntimeMismatches(wrong), [
    { proposalId: "EIP-8151", expected: "accounts-wallets", actual: "interoperability" },
  ]);
});

test("weekly repository addition quality uses canonical rows and empty state", () => {
  const one = dashboardV3QualityFixture({ repositoryAdditions: 1, proposalCreatedOffsetDays: -1, rawPosts: 0, activeThreads: 0 });
  assert.equal(__qualityTestHooks.weeklyEmptyStateValid({} as never, one.api, one.html), true);
  assert.equal(__qualityTestHooks.weeklyRepositoryAdditionLabel(one.api, one.html), true);
  assert.equal(__qualityTestHooks.heroRepositoryCountConsistency(one.api, one.html), true);
  assert.equal(__qualityTestHooks.weeklyRepositoryAdditionsFromApi(one.api).length, 1);
  assert.match(one.html, /공식 저장소 신규 반영/);
  assert.match(one.html, /저장소 반영 2026\.08\.07/);
  assert.match(one.html, /문서 작성 2026\.08\.06/);

  const zero = dashboardV3QualityFixture({ repositoryAdditions: 0, rawPosts: 0, activeThreads: 0 });
  assert.equal(__qualityTestHooks.weeklyEmptyStateValid({} as never, zero.api, zero.html), true);
  assert.equal(__qualityTestHooks.weeklyRepositoryAdditionLabel(zero.api, zero.html), true);
  assert.equal(__qualityTestHooks.heroRepositoryCountConsistency(zero.api, zero.html), true);
  assert.match(zero.html, /최근 기간 공식 저장소 신규 반영이 없습니다/);
});

test("weekly repository count invariants survive changed next-week counts", () => {
  for (const repositoryAdditions of [2, 3]) {
    const fixture = dashboardV3QualityFixture({ repositoryAdditions, proposalCreatedOffsetDays: -2, rawPosts: 0, activeThreads: 0, reportDate: "2026-08-14" });
    assert.equal(__qualityTestHooks.weeklyRepositoryAdditionsFromApi(fixture.api).length, repositoryAdditions);
    assert.equal(__qualityTestHooks.heroRepositoryCountConsistency(fixture.api, fixture.html), true);
    assert.equal((fixture.html.match(/data-weekly-repository-addition(?:\s|=)/g) ?? []).length, repositoryAdditions);
  }
});

test("Magicians current-window cards compare thread cards separately from raw posts", () => {
  const fixture = dashboardV3QualityFixture({ repositoryAdditions: 0, rawPosts: 10, activeThreads: 4 });
  assert.match(fixture.html, /원문 게시물 10건/);
  assert.equal((fixture.html.match(/<article class="dash-thread-card/g) ?? []).length, 4);
  assert.equal(__qualityTestHooks.magiciansCurrentWindowCards(fixture.api, fixture.html), true);
});

function visibleReportHtml(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<script type="application\/json" id="technology-platform-api">[\s\S]*?<\/script>/, "")
    .replace(/<!-- EIPreporter chart data: [\s\S]*? -->/, "")
    .replace(/<script>[\s\S]*?<\/script>/, "");
}

function dashboardV3QualityFixture(input: {
  repositoryAdditions: number;
  rawPosts: number;
  activeThreads: number;
  proposalCreatedOffsetDays?: number;
  reportDate?: string;
}) {
  const reportDate = input.reportDate ?? "2026-08-07";
  const generatedAt = `${reportDate}T05:00:00.000Z`;
  const repoIds = Array.from({ length: input.repositoryAdditions }, (_, index) => `EIP-${8368 + index}`);
  const threadIds = Array.from({ length: input.activeThreads }, (_, index) => `ERC-${8183 + index}`);
  const postCounts = input.activeThreads ? distributeCounts(input.rawPosts, input.activeThreads) : [];
  const proposalRows = [...repoIds, ...threadIds].map((proposalId, index) => proposalRowForDashboardV3(proposalId, index));
  const weeklyItems = repoIds.map((proposalId, index) => ({
    eventId: `event:${proposalId}:repo`,
    proposalId,
    title: `${proposalId} Official Title`,
    eventType: "new_proposal",
    occurredAt: `${reportDate}T02:00:00.000Z`,
    toStatus: "Draft",
    sourceUrl: `https://eips.ethereum.org/EIPS/eip-${proposalId.split("-")[1]}`,
    sourcePath: `EIPS/eip-${proposalId.split("-")[1]}.md`,
    evidenceIds: [`event:${proposalId}:repo`],
  }));
  const proposalCreatedDate = dateOffset(reportDate, input.proposalCreatedOffsetDays ?? 0);
  const threads = threadIds.map((proposalId, index) => ({
    proposalId,
    title: `${proposalId} discussion`,
    rawPostCount: postCounts[index] ?? 0,
    uniqueParticipantCount: Math.max(1, postCounts[index] ?? 0),
    latestActivityAt: `${reportDate}T03:00:00.000Z`,
    sourceUrl: `https://ethereum-magicians.org/t/${proposalId.toLowerCase()}/1`,
    sourcePath: `discussion/${proposalId}`,
    evidenceIds: [`post:${proposalId}:1`],
    collectionStatus: "posts_fully_collected",
    daily: [{ date: reportDate, rawPostCount: postCounts[index] ?? 0 }],
  }));
  const facts = {
    specificationEvidence: proposalRows.map((row) => ({
      factId: `spec:${row.proposalId}`,
      proposalId: row.proposalId,
      officialTitle: row.title,
      status: "Draft",
      sourceUrl: row.sourceUrl,
      abstractText: `${row.proposalId}는 공식 원문 기준 테스트 제안입니다.`,
    })),
    logicalDevelopmentEvents: repoIds.map((proposalId) => ({
      proposalId,
      eventType: "proposal_published",
      occurredAt: `${proposalCreatedDate}T01:00:00.000Z`,
    })),
    developmentEvents: weeklyItems,
  };
  const view = {
    metadata: { generatedAt, reportDate, sourceMode: "snapshot" },
    filters: {
      periods: ["7d", "30d", "180d"],
      evidence: ["all", "specification", "discussion", "implementation"],
      domains: ["accounts-wallets"],
      statuses: ["Draft"],
    },
    overview: {
      weeklyUsableCount: { value: input.repositoryAdditions },
      activeMagiciansThreadCount: { value: input.activeThreads },
      rawPostCount: { value: input.rawPosts },
      uniqueParticipantCount: { value: input.rawPosts },
    },
    monitoringScope: { monitoredProposalCount: proposalRows.length, detailedProposalCount: input.activeThreads, discussionThreadCount: input.activeThreads },
    weeklyTimeline: { items: weeklyItems, totalUsableCount: input.repositoryAdditions, usableEventIds: weeklyItems.map((item) => item.eventId) },
    developmentTrend: { weeks: [{ weekStart: reportDate, confirmedSpecificationChanges: input.repositoryAdditions }] },
    topicActivityMap: { points: [], totalCurrent7d: input.repositoryAdditions },
    developerActivity: {
      rawPostCount: input.rawPosts,
      activeThreadCount: input.activeThreads,
      uniqueParticipantCount: input.rawPosts,
      validTechnicalPostCount: null,
      analyzedInsightCount: 0,
      threads,
      matrixPoints: [],
      heatmapRows: threads.map((thread) => ({ proposalId: thread.proposalId, daily: thread.daily })),
    },
    lifecycleBoard: [{ stage: "Draft", proposals: proposalRows }],
    proposalExplorer: { totalCurrent7d: input.repositoryAdditions, rows: proposalRows },
    aaMatrix: { tracks: [] },
    kgldBoard: { groups: { research_now: [], monitor: [], no_action: [] }, executiveKgldIds: [], boardKgldIds: [] },
    evidenceQuality: {
      rawEvents: input.repositoryAdditions,
      usableEvents: input.repositoryAdditions,
      unknownSemanticEvents: 0,
      fallbackTimestamps: 0,
      threadCollection: { full: input.activeThreads, partial: 0, failed: 0 },
      discussionRelevance: "unclassified",
      implementationEvidence: "not_collected",
      weeklyRankingValidity: "valid",
    },
    technologyMapPostIds: [],
  };
  const presentation = __qualityTestHooks.buildDashboardV3Presentation(view as never, facts as never, { generatedAt, reportDate });
  const html = __qualityTestHooks.renderDashboardV3(presentation);
  return {
    html,
    api: { intelligenceSnapshot: { facts, views: { dashboardV2: view } } },
  };
}

function proposalRowForDashboardV3(proposalId: string, index: number) {
  return {
    proposalId,
    title: `${proposalId} Official Title`,
    status: "Draft",
    domainId: "accounts-wallets",
    domain: "계정·권한",
    topic: "Account Authorization",
    counts: {
      current7d: index === 0 ? 1 : 0,
      current30d: index === 0 ? 1 : 0,
      current180d: index === 0 ? 1 : 0,
      rawPosts: 0,
      participants: 0,
      validTechnicalPostCount: null,
    },
    weeklyUsableEventIds: index === 0 ? [`event:${proposalId}:repo`] : [],
    latestChangeAt: "2026-08-07T02:00:00.000Z",
    evidenceIds: [`spec:${proposalId}`],
    sourcePath: `EIPS/eip-${proposalId.split("-")[1]}.md`,
    sourceUrl: `https://eips.ethereum.org/EIPS/eip-${proposalId.split("-")[1]}`,
    evidenceState: "confirmed",
    abstractSummary: `${proposalId}는 공식 원문 기준 테스트 제안입니다.`,
    isAA: false,
    kgldRelevance: false,
    tags: [],
  };
}

function dateOffset(date: string, offsetDays: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function weeklySignalScenario(usableCount: number, rawCount: number) {
  const db = openDatabase(":memory:");
  try {
    const proposalCount = Math.max(1, usableCount);
    const records = Array.from({ length: proposalCount }, (_, index) => ({
      ...makeRecord(),
      proposalId: `ERC-${4626 + index}`,
      number: 4626 + index,
      sourcePath: `ERCS/erc-${4626 + index}.md`,
      canonicalUrl: `https://example.test/ERC-${4626 + index}`,
    }));
    insertSnapshot(db, records);
    const report = buildWeeklyReport(db, new Date("2026-06-12T12:00:00.000Z"));
    assert.ok(report);

    const usable = Array.from({ length: usableCount }, (_, index) => makeChangeEvent(index + 1, `usable-${index + 1}`, {
      proposalId: `ERC-${4626 + index}`,
      sourcePath: `ERCS/erc-${4626 + index}.md`,
      canonicalUrl: `https://example.test/ERC-${4626 + index}`,
      changeSemanticType: "normative_specification",
      occurredAtSource: "git_commit",
      timestampConfidence: "high",
    }));
    const unusable = Array.from({ length: Math.max(0, rawCount - usableCount) }, (_, index) => makeChangeEvent(index + 101, `unusable-${index + 1}`, {
      proposalId: `ERC-${4626 + (index % proposalCount)}`,
      sourcePath: `ERCS/erc-${4626 + (index % proposalCount)}.md`,
      canonicalUrl: `https://example.test/ERC-${4626 + (index % proposalCount)}`,
      changeSemanticType: "unknown",
      occurredAtSource: "fallback_detected_at",
      timestampConfidence: "low",
    }));
    setReportEvents(report, [...usable, ...unusable]);

    const html = generateWeeklyHtml(report);
    const visibleHtml = visibleReportHtml(html);
    const api = JSON.parse(html.match(/<script type="application\/json" id="technology-platform-api">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
    return { report, html, visibleHtml, api };
  } finally {
    db.close();
  }
}

function htmlForOfficialSourceFixture(): string {
  const db = openDatabase(":memory:");
  try {
    insertSnapshot(db, [makeRecord("ERC-4626", "Final", "hash-4626", "Tokenized Vaults", "ERC")]);
    const report = buildWeeklyReport(db, new Date("2026-06-12T12:00:00.000Z"));
    assert.ok(report);
    return generateWeeklyHtml(report);
  } finally {
    db.close();
  }
}

function embeddedPlatformApi(html: string) {
  return JSON.parse(html.match(/<script type="application\/json" id="technology-platform-api">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
}

function canonicalQualityFixture(input: {
  reportAsOf: string;
  postCount: number;
  threadCount: number;
  topProposals: string[];
  technologyMapPostCount: number;
  inputSnapshotHash?: string;
}) {
  const reportDate = "2026-07-31";
  const fixture = __qualityTestHooks.GOLDEN_FIXTURES.find((item) =>
    item.reportDate === reportDate
    && item.reportAsOf === input.reportAsOf
    && item.developerActivity.postCount === input.postCount
    && item.developerActivity.threadCount === input.threadCount
  );
  const postIds = Array.from({ length: input.postCount }, (_, index) => `post-${index + 1}`);
  const threadIds = Array.from({ length: input.threadCount }, (_, index) => `thread-${index + 1}`);
  const counts = distributeCounts(input.postCount, input.topProposals.length);
  const activity = input.topProposals.map((proposalId, index) => {
    const rawPostIds = postIds.slice(counts.slice(0, index).reduce((sum, value) => sum + value, 0), counts.slice(0, index + 1).reduce((sum, value) => sum + value, 0));
    return {
      proposalId,
      title: `${proposalId} title`,
      rawPostIds,
      rawPostCount: rawPostIds.length,
    };
  });
  for (let index = input.topProposals.length; index < input.threadCount; index += 1) {
    const proposalId = `ERC-${9000 + index}`;
    activity.push({ proposalId, title: `${proposalId} title`, rawPostIds: [], rawPostCount: 0 });
  }
  const technologyPostIds = postIds.slice(0, input.technologyMapPostCount);
  const domains = Array.from({ length: 8 }, (_, index) => {
    const rawPostIds = index === 0 ? technologyPostIds : [];
    return {
      domainId: `domain-${index + 1}`,
      rawDiscussionPosts: rawPostIds.length,
      discussion: {
        rawPostIds,
        rawPostCount: rawPostIds.length,
      },
    };
  });
  const developerSummary = {
    rawPostIds: postIds,
    rawPosts: postIds.length,
    activeThreadIds: threadIds,
    activeThreads: threadIds.length,
  };
  const dashboard = {
    executivePulse: {
      whatChanged: {
        magiciansActivity: activity.slice(0, 3).map((item) => ({ proposalIds: [item.proposalId] })),
      },
    },
    technologyLandscape: domains,
    focusProgress: [{ topicId: "focus-1", proposalIds: [input.topProposals[0]], progress: { specificationStage: "Draft" } }],
    developerAttention: {
      summary: developerSummary,
      activity,
    },
    accountAbstraction: {
      tracks: Array.from({ length: 12 }, (_, index) => ({ id: `aa-${index + 1}` })),
      summary: { implementationEvidence: 0 },
    },
    kgldWatch: {
      summary: { reviewNow: 1, researchNow: 1, monitor: 1, noAction: 1 },
      groups: {
        research_now: [{ proposalId: "ERC-4626", internalAction: "review", nextTrigger: "trigger", sourceUrls: ["https://eips.ethereum.org/EIPS/eip-4626"] }],
        monitor: [{ proposalId: "EIP-712", internalAction: "monitor", nextTrigger: "trigger", sourceUrls: ["https://eips.ethereum.org/EIPS/eip-712"] }],
        no_action: [{ proposalId: "ERC-20", internalAction: "none", nextTrigger: "trigger", sourceUrls: ["https://eips.ethereum.org/EIPS/eip-20"] }],
      },
    },
  };
  const snapshot = {
    metadata: {
      schemaVersion: "intelligence-snapshot/v2",
      snapshotHash: "",
      generatedAt: input.reportAsOf,
      reportDate,
      reportAsOf: input.reportAsOf,
      inputSnapshotHash: input.inputSnapshotHash ?? fixture?.inputSnapshotHash ?? "unregistered-input-hash",
    },
    facts: {
      discussionPosts: postIds.map((postId, index) => ({ postId, factId: `post:${postId}`, createdAt: input.reportAsOf })),
      developmentEvents: [],
      specificationEvidence: [],
    },
    aggregates: {
      discussion: {
        developer_activity_set: developerSummary,
        technology_map_set: {
          rawPostIds: technologyPostIds,
          rawPostCount: technologyPostIds.length,
        },
      },
    },
    views: dashboard,
  };
  snapshot.metadata.snapshotHash = __qualityTestHooks.snapshotHash(snapshot);

  return {
    embeddedApi: {
      schemaVersion: snapshot.metadata.schemaVersion,
      snapshotHash: snapshot.metadata.snapshotHash,
      intelligenceSnapshot: snapshot,
    },
    visibleHtml: `<span>기술 지도 최근 7일 댓글</span><b>${input.technologyMapPostCount}</b><span>Developer ${input.postCount}</span>`,
  };
}

function monitoringScopeApi(input: { discovered: number; publicCount: number; excluded: number; monitored: number; cards: number }) {
  const publicIds = Array.from({ length: input.publicCount }, (_, index) => `ERC-${7000 + index}`);
  const excludedIds = Array.from({ length: input.excluded }, (_, index) => `EIP-${9000 + index}`);
  const specificationEvidence = [...publicIds, ...excludedIds].map((proposalId) => ({ proposalId, factId: `spec:${proposalId}` }));
  assert.equal(specificationEvidence.length, input.discovered);
  return {
    intelligenceSnapshot: {
      facts: { specificationEvidence },
      views: {
        dashboardV2: {
          proposalExplorer: {
            rows: publicIds.map((proposalId) => ({
              proposalId,
              title: `${proposalId} title`,
              status: "Draft",
              domainId: "accounts-wallets",
              domain: "계정·권한",
              topic: "Wallet UX",
              weeklyUsableEventIds: [],
              counts: { current7d: 0 },
            })),
          },
          monitoringScope: {
            monitoredProposalCount: input.monitored,
            detailedProposalCount: input.cards,
          },
        },
      },
    },
  };
}

function weeklySummaryApi(input: { proposalId: string; title: string; summary: string }) {
  const fixture = dashboardV3QualityFixture({ repositoryAdditions: 1, rawPosts: 0, activeThreads: 0 });
  const view = fixture.api.intelligenceSnapshot.views.dashboardV2;
  const row = view.proposalExplorer.rows[0];
  row.proposalId = input.proposalId;
  row.title = input.title;
  row.sourcePath = `EIPS/eip-${input.proposalId.split("-")[1]}.md`;
  row.sourceUrl = `https://eips.ethereum.org/EIPS/eip-${input.proposalId.split("-")[1]}`;
  row.abstractSummary = "This proposal normalizes state gas limit handling.";
  row.evidenceIds = [`spec:${input.proposalId}`];
  const item = view.weeklyTimeline.items[0];
  item.proposalId = input.proposalId;
  item.title = input.title;
  item.sourcePath = row.sourcePath;
  item.sourceUrl = row.sourceUrl;
  item.evidenceIds = [`event:${input.proposalId}:repo`];
  view.lifecycleBoard[0].proposals = [row];
  fixture.api.intelligenceSnapshot.facts.specificationEvidence[0].proposalId = input.proposalId;
  fixture.api.intelligenceSnapshot.facts.specificationEvidence[0].officialTitle = input.title;
  fixture.api.intelligenceSnapshot.facts.specificationEvidence[0].abstractText = row.abstractSummary;
  fixture.api.intelligenceSnapshot.facts.logicalDevelopmentEvents[0].proposalId = input.proposalId;
  assert.equal(__qualityTestHooks.weeklyRepositoryAdditionsFromApi(fixture.api)[0]?.summary, input.summary);
  return fixture.api;
}

function knownDomainApi(
  rows: Array<{ proposalId: string; domainId: string }>,
  sourceOnlyIds: string[] = [],
  generatedAt = "2026-08-10T00:00:00.000Z",
) {
  return {
    intelligenceSnapshot: {
      metadata: { generatedAt, reportDate: generatedAt.slice(0, 10) },
      facts: {
        specificationEvidence: [...rows.map((row) => row.proposalId), ...sourceOnlyIds].map((proposalId) => ({
          factId: `spec:${proposalId}`,
          proposalId,
          officialTitle: `${proposalId} title`,
        })),
      },
      views: {
        dashboardV2: {
          proposalExplorer: {
            rows: rows.map((row) => ({
              proposalId: row.proposalId,
              title: `${row.proposalId} title`,
              status: "Draft",
              domainId: row.domainId,
              domain: row.domainId,
              topic: "fixture",
              counts: { current7d: 0, current30d: 0, current180d: 0, rawPosts: 0, participants: 0 },
              weeklyUsableEventIds: [],
              evidenceIds: [`spec:${row.proposalId}`],
            })),
          },
        },
      },
    },
  };
}

function distributeCounts(total: number, buckets: number): number[] {
  const counts = Array.from({ length: buckets }, () => 1);
  let remaining = Math.max(0, total - buckets);
  let index = 0;
  while (remaining > 0) {
    counts[index % buckets] += 1;
    remaining -= 1;
    index += 1;
  }
  return counts;
}

function makeRecord(
  proposalId = "ERC-4626",
  status = "Final",
  rawContentHash = "hash",
  title = "Tokenized Vaults",
  category = "ERC",
): ProposalRecord {
  const [kind, rawNumber] = proposalId.split("-");
  const number = Number(rawNumber);
  return {
    proposalId,
    kind: kind as ProposalRecord["kind"],
    number,
    title,
    status,
    proposalType: "Standards Track",
    category,
    created: "2026-01-22",
    updated: null,
    discussionTo: null,
    discussionLinks: [],
    sourceRepo: kind === "ERC" ? "ethereum/ercs" : "ethereum/EIPs",
    sourcePath: kind === "ERC" ? `ERCS/erc-${number}.md` : `EIPS/eip-${number}.md`,
    canonicalUrl: `https://example.test/${proposalId}`,
    rawContentHash,
  };
}

function writeProposalSource(root: string, proposalId: string, title: string, status: string, abstractText: string, specificationText: string): void {
  const [kind, rawNumber] = proposalId.split("-");
  const number = Number(rawNumber);
  const folder = kind === "ERC" ? "ERCS" : "EIPS";
  const prefix = kind === "ERC" ? "erc" : "eip";
  writeFileSync(join(root, folder, `${prefix}-${number}.md`), `---
eip: ${number}
title: ${title}
status: ${status}
---

# ${proposalId}: ${title}

## Abstract

${abstractText}

## Specification

${specificationText}
`, { encoding: "utf8" });
}

function emergingIssue(proposalId: string, heatScore: number, index: number, status: EmergingIssue["status"] = "EARLY_SIGNAL"): EmergingIssue {
  return {
    issueId: `proposal:${proposalId}`,
    title: index === 7 ? "Full list only candidate 7" : `Emerging fixture ${index}`,
    primaryProposalId: proposalId,
    relatedProposalIds: [],
    eipIds: [proposalId],
    status,
    stage: "DISCUSSION",
    heatScore,
    confidenceScore: 50,
    sources: ["ethereum_magicians"],
    createdAt: "2026-08-05T00:00:00.000Z",
    lastActivityAt: "2026-08-09T00:00:00.000Z",
    metrics: { replyCount: 10 + index, viewCount: 500 + index, participantCount: 3, velocity: [] },
    scoreBreakdown: [],
    sourceSignals: [{
      source: "ethereum_magicians",
      sourceId: `topic-${proposalId}`,
      url: `https://ethereum-magicians.org/t/topic/${9300 + index}`,
      title: `Emerging fixture ${index}`,
      primaryProposalId: proposalId,
      relatedProposalIds: [],
      extractedEipIds: [proposalId],
      collectedAt: "2026-08-10T00:00:00.000Z",
      facts: {},
    }],
    summaries: {
      whatIsHappening: "최근 활동 후보입니다.",
      whyMoving: "최근 활동이 증가했습니다.",
      whyItMatters: "프로토콜 수준의 확인이 필요합니다.",
      watchNext: "후속 논의를 확인합니다.",
    },
    facts: { sourceCount: 1 },
  };
}

function makeChangeEvent(id: number, hash: string, overrides: Partial<ChangeEvent>): ChangeEvent {
  return {
    id,
    snapshotId: 1,
    previousSnapshotId: 1,
    type: "content_hash_change",
    proposalId: "ERC-4626",
    previousStatus: "Final",
    currentStatus: "Final",
    previousHash: `previous-${hash}`,
    currentHash: hash,
    title: "Tokenized Vaults",
    sourceRepo: "ethereum/ercs",
    sourcePath: "ERCS/erc-4626.md",
    canonicalUrl: "https://example.test/ERC-4626",
    changedFiles: ["ERCS/erc-4626.md"],
    changedSections: ["Specification"],
    diffSummary: "Specification text changed.",
    diffEvidence: "git diff",
    detectedAt: "2026-06-10T12:00:00.000Z",
    occurredAt: "2026-06-10T12:00:00.000Z",
    ...overrides,
  } as ChangeEvent;
}

function setReportEvents(report: WeeklyRadarReport, events: ChangeEvent[]): void {
  report.ethereumTechRadar.recentChanges = {
    total: events.length,
    byEventType: { new_proposal: 0, status_change: 0, final_transition: 0, withdrawn_transition: 0, content_hash_change: events.length },
    finalTransitions: [],
    withdrawnTransitions: [],
    statusChanges: [],
    newProposals: [],
    contentHashChanges: events,
  };
  const older = makeChangeEvent(99, "older-trend", {
    changeSemanticType: "normative_specification",
    occurredAt: "2026-05-01T00:00:00.000Z",
    detectedAt: "2026-05-01T00:00:00.000Z",
    occurredAtSource: "git_commit",
    timestampConfidence: "high",
  });
  report.ethereumTechRadar.trendChanges = {
    total: events.length + 1,
    byEventType: { new_proposal: 0, status_change: 0, final_transition: 0, withdrawn_transition: 0, content_hash_change: events.length + 1 },
    finalTransitions: [],
    withdrawnTransitions: [],
    statusChanges: [],
    newProposals: [],
    contentHashChanges: [...events, older],
  };
}

function eventKey(event: ChangeEvent): string {
  return `${event.proposalId}:${event.type}:${event.occurredAt ?? event.detectedAt}:${event.currentHash ?? ""}`;
}
