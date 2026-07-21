import assert from "node:assert/strict";
import test from "node:test";
import { generateWeeklyHtml } from "../src/html-report.ts";
import { buildTechnologyPlatformLayer } from "../src/platform.ts";
import type { AdoptionEvidenceItem, ThemeInsight, WeeklyRadarReport } from "../src/types.ts";

test("builds independent lifecycle stages without inferring release activation or adoption", () => {
  const report = makeReport([implementationTrackerEvidence()]);
  const platform = buildTechnologyPlatformLayer(report);
  const timeline = platform.lifecycleTimelines.find((item) => item.proposalId === "EIP-8141")!;

  assert.equal(timeline.currentStage, "Implementation Tracking");
  assert.equal(stage(timeline, "Implementation Tracking").state, "current");
  assert.equal(stage(timeline, "Verified Implementation").state, "future");
  assert.equal(stage(timeline, "Released").state, "future");
  assert.equal(stage(timeline, "Activated").state, "future");
  assert.equal(stage(timeline, "Production Adoption").state, "future");
  assert.match(stage(timeline, "Implementation Tracking").limitations[0]!, /not verified client support/i);
});

test("classifies client coverage separately from release and activation", () => {
  const report = makeReport([verifiedGethEvidence()]);
  const platform = buildTechnologyPlatformLayer(report);
  const matrix = platform.clientMatrices.find((item) => item.proposalId === "EIP-8141")!;
  const geth = matrix.clients.find((item) => item.client === "go-ethereum")!;
  const besu = matrix.clients.find((item) => item.client === "Besu")!;

  assert.equal(geth.status, "Verified");
  assert.equal(besu.status, "No evidence");
  assert.equal(platform.releaseIntelligence.find((item) => item.proposalId === "EIP-8141")?.status, "No release");
  assert.equal(platform.deploymentIntelligence.find((item) => item.proposalId === "EIP-8141")?.status, "No evidence");
});

test("release evidence does not infer activation or production adoption", () => {
  const report = makeReport([releaseEvidence()]);
  const platform = buildTechnologyPlatformLayer(report);
  const timeline = platform.lifecycleTimelines.find((item) => item.proposalId === "EIP-8141")!;

  assert.equal(platform.releaseIntelligence.find((item) => item.proposalId === "EIP-8141")?.status, "Released");
  assert.equal(platform.deploymentIntelligence.find((item) => item.proposalId === "EIP-8141")?.status, "No evidence");
  assert.equal(stage(timeline, "Released").state, "current");
  assert.equal(stage(timeline, "Activated").state, "future");
  assert.equal(stage(timeline, "Production Adoption").state, "future");
});

test("canonical hardfork wording does not become activation evidence", () => {
  const platform = buildTechnologyPlatformLayer(makeReport([canonicalHardforkEvidence()]));
  const deployment = platform.deploymentIntelligence.find((item) => item.proposalId === "EIP-8141")!;

  assert.equal(deployment.status, "No evidence");
  assert.equal(stage(platform.lifecycleTimelines[0]!, "Activated").state, "future");
  assert.equal(stage(platform.lifecycleTimelines[0]!, "Production Adoption").state, "future");
});

test("builds evidence graph, radar, risk, confidence, KGLD and dashboard API models", () => {
  const report = makeReport([implementationTrackerEvidence()]);
  const platform = buildTechnologyPlatformLayer(report);
  const graph = platform.evidenceGraphs.find((item) => item.proposalId === "EIP-8141")!;
  const confidence = platform.confidence.find((item) => item.proposalId === "EIP-8141")!;
  const kgld = platform.kgldIntelligence.find((item) => item.proposalId === "EIP-8141")!;

  assert.ok(graph.nodes.some((node) => node.type === "EIP"));
  assert.ok(graph.edges.some((edge) => edge.type === "tracks"));
  assert.ok(platform.technologyRadar.some((item) => item.proposalId === "EIP-8141" && item.quadrant === "Watch"));
  assert.ok(platform.risks.some((item) => item.type === "High discussion / no implementation"));
  assert.equal(confidence.weights.map((item) => item.percent).reduce((sum, value) => sum + value, 0), 100);
  assert.equal(confidence.scoreBreakdown.reduce((sum, item) => sum + item.value, 0), confidence.overall);
  assert.equal(kgld.areas.some((area) => area.area === "Execution impact" && area.level !== "None"), true);
  assert.equal(kgld.overall, "Monitor");
  assert.ok(platform.dashboard.topMovers.includes("EIP-8141"));
  assert.equal(platform.dashboard.releaseWatch.length, 0);
  assert.equal(platform.dashboard.activationWatch.length, 0);
  assert.equal(platform.api.lifecycle.length, platform.lifecycleTimelines.length);
});

test("HTML renders executive UX with collapsed low-value sections and score explanations", () => {
  const report = makeReport([implementationTrackerEvidence()]);
  report.ethereumTechRadar.technologyPlatformLayer = buildTechnologyPlatformLayer(report);
  const html = generateWeeklyHtml(report);
  const visibleHtml = html
    .replace(/<script type="application\/json" id="technology-platform-api">[\s\S]*?<\/script>/, "")
    .replace(/<!-- EIPreporter chart data: [\s\S]*? -->/, "");

  assert.match(html, /이번 주 핵심 신호/);
  assert.match(html, /플랫폼 대시보드/);
  assert.match(html, /데이터 수집 완전성/);
  assert.match(html, /라이프사이클 인텔리전스/);
  assert.match(html, /lifecycle-rail/);
  assert.match(html, /secondary-lifecycle/);
  assert.match(html, /클라이언트 구현 현황/);
  assert.match(html, /target-specific 구현 근거가 확인되지 않았습니다/);
  assert.doesNotMatch(html, /<h2>릴리스 관찰<\/h2>/);
  assert.doesNotMatch(html, /<h2>활성화 관찰<\/h2>/);
  assert.doesNotMatch(html, /id="release-deployment-intelligence"><\/section>/);
  assert.match(html, /근거 그래프/);
  assert.match(html, /기술 레이더/);
  assert.match(html, /radar-grid quadrants-1/);
  assert.match(html, /테마 인텔리전스/);
  assert.match(html, /KGLD 영향 요약/);
  assert.match(html, /리스크 근거/);
  assert.match(html, /신뢰도 산식/);
  assert.match(html, /라이프사이클 신뢰도/);
  assert.match(html, /KGLD 근거/);
  assert.match(html, /technology-platform-api/);
  assert.doesNotMatch(html, /운영 채택<\/span><\/div><span class="meta"[^>]*>[^<]*current/);
  assert.doesNotMatch(html, /[湲蹂理]|쨌|�/);
  assert.doesNotMatch(visibleHtml, /impact 은|impact 는|source\(s\)|area\(s\)|Draft with Monitor|Discussion contributes/);
});

test("partial collection is not treated as no evidence", () => {
  const report = makeReport([]);
  report.ethereumTechRadar.adoptionLayer = { generatedBy: "github_search", collectionStatus: "failed", items: [], note: "GitHub API rate limited" };
  const platform = buildTechnologyPlatformLayer(report);

  assert.equal(platform.dataCompleteness.status, "degraded");
  assert.equal(platform.dataCompleteness.partialCollection, true);
  assert.match(platform.dataCompleteness.explanation, /incomplete/i);
  assert.equal(stage(platform.lifecycleTimelines[0]!, "Verified Implementation").state, "future");
});

test("stale evidence is marked without presenting it as current", () => {
  const report = makeReport([staleImplementationTrackerEvidence()]);
  const platform = buildTechnologyPlatformLayer(report);
  const tracking = stage(platform.lifecycleTimelines[0]!, "Implementation Tracking");
  report.ethereumTechRadar.technologyPlatformLayer = platform;
  const html = generateWeeklyHtml(report);

  assert.equal(tracking.freshness?.stale, true);
  assert.equal(platform.staleEvidenceCount > 0, true);
  assert.match(html, /근거가 오래되었을 수 있습니다/);
});

test("derived platform claims include traceability metadata", () => {
  const platform = buildTechnologyPlatformLayer(makeReport([implementationTrackerEvidence()]));
  const timeline = platform.lifecycleTimelines[0]!;

  assert.ok(timeline.traceability.evidenceIds.length > 0);
  assert.ok(timeline.traceability.calculationVersion);
  assert.ok(timeline.stages.every((item) => item.traceability.evidenceIds.length > 0 || item.evidence.length === 0));
  assert.ok(platform.clientMatrices[0]!.clients.every((item) => item.traceability.calculationVersion));
  assert.ok(platform.releaseIntelligence.every((item) => item.traceability.calculationVersion));
  assert.ok(platform.deploymentIntelligence.every((item) => item.traceability.calculationVersion));
  assert.ok(platform.risks.every((item) => item.traceability.evidenceIds.length > 0));
  assert.ok(platform.confidence.every((item) => item.traceability.evidenceIds.length > 0));
  assert.ok(platform.kgldIntelligence.every((item) => item.traceability.calculationVersion));
});

test("empty release activation and isolated graph content are hidden", () => {
  const report = makeReport([]);
  report.ethereumTechRadar.adoptionLayer = { generatedBy: "github_search", collectionStatus: "collected", items: [] };
  report.ethereumTechRadar.technologyPlatformLayer = buildTechnologyPlatformLayer(report);
  const html = generateWeeklyHtml(report);

  assert.doesNotMatch(html, /<h2>릴리스 관찰<\/h2>/);
  assert.doesNotMatch(html, /<h2>활성화 관찰<\/h2>/);
  assert.doesNotMatch(html, /id="release-deployment-intelligence"><\/section>/);
  assert.doesNotMatch(html, /only the EIP node/i);
  assert.match(html, /target-specific 구현 근거가 확인되지 않았습니다/);
});

function stage(timeline: ReturnType<typeof buildTechnologyPlatformLayer>["lifecycleTimelines"][number], name: string) {
  const found = timeline.stages.find((item) => item.name === name);
  assert.ok(found);
  return found;
}

function implementationTrackerEvidence(): AdoptionEvidenceItem {
  return {
    proposalId: "EIP-8141",
    title: "Frame Transaction",
    theme: "Transaction Model / Execution",
    evidenceLevel: "Reference",
    evidenceScore: 35,
    sources: [{
      sourceType: "github_issue",
      semanticType: "implementation_tracker",
      relationship: "direct",
      repo: "ethereum/execution-specs",
      title: "EIP-8141 Implementation Tracker: Frame Transaction",
      url: "https://github.com/ethereum/execution-specs/issues/2829",
      state: "open",
      updatedAt: "2026-07-18T00:00:00Z",
      evidenceKind: "reference",
      confidence: "Medium",
    }],
    summary: "Implementation tracking references were found, but no verified client implementation or production support was identified.",
    caution: "Reference evidence should be reviewed manually before upgrading the signal.",
  };
}

function staleImplementationTrackerEvidence(): AdoptionEvidenceItem {
  const item = implementationTrackerEvidence();
  item.sources = item.sources.map((source) => ({ ...source, updatedAt: "2026-06-01T00:00:00Z" }));
  return item;
}

function verifiedGethEvidence(): AdoptionEvidenceItem {
  return {
    ...implementationTrackerEvidence(),
    evidenceLevel: "Implementation",
    evidenceScore: 50,
    sources: [{
      sourceType: "code_reference",
      semanticType: "client_code_reference",
      relationship: "direct",
      repo: "ethereum/go-ethereum",
      title: "core/types/eip-8141-frame-tx.go",
      path: "core/types/eip-8141-frame-tx.go",
      url: "https://github.com/ethereum/go-ethereum/blob/master/core/types/eip-8141-frame-tx.go",
      evidenceKind: "implementation",
      confidence: "Medium",
    }],
  };
}

function releaseEvidence(): AdoptionEvidenceItem {
  return {
    ...verifiedGethEvidence(),
    sources: [{
      sourceType: "release_note",
      semanticType: "client_implementation_pr",
      relationship: "direct",
      repo: "ethereum/go-ethereum",
      title: "go-ethereum v1.99 release notes include EIP-8141",
      url: "https://github.com/ethereum/go-ethereum/releases/tag/v1.99.0",
      evidenceKind: "implementation",
      confidence: "High",
    }],
  };
}

function canonicalHardforkEvidence(): AdoptionEvidenceItem {
  return {
    ...implementationTrackerEvidence(),
    sources: [{
      sourceType: "github_pr",
      semanticType: "canonical_status_change",
      relationship: "direct",
      repo: "ethereum/EIPs",
      title: "Update EIP-8141: Hardfork Meta - Move to Final",
      url: "https://github.com/ethereum/EIPs/pull/99999",
      evidenceKind: "reference",
      confidence: "Medium",
    }],
  };
}

function makeReport(adoptionItems: AdoptionEvidenceItem[]): WeeklyRadarReport {
  return {
    generatedAt: "2026-07-20T00:00:00.000Z",
    trendPeriod: { from: "2026-01-21T00:00:00.000Z", to: "2026-07-20T00:00:00.000Z", days: 180 },
    changePeriod: { from: "2026-07-13T00:00:00.000Z", to: "2026-07-20T00:00:00.000Z", days: 7 },
    ethereumTechRadar: {
      latestSnapshot: { id: 1, collectedAt: "2026-07-20T00:00:00.000Z", proposalCount: 1 },
      totalProposals: 1,
      proposalsByRepo: { "ethereum/EIPs": 1 },
      proposalsByStatus: { Draft: 1 },
      proposalsByType: { Standards: 1 },
      proposalsByCategory: { Core: 1 },
      trendProposalCount: 1,
      themeInsights: [theme()],
      accountAbstractionRadar: {
        proposalCount: 0,
        subTrendDistribution: {},
        representativeProposals: [],
        trendInterpretation: "",
        kgldWalletUxInterpretation: "",
      },
      recentChanges: {
        total: 0,
        byEventType: { new_proposal: 0, status_change: 0, final_transition: 0, withdrawn_transition: 0, content_hash_change: 0 },
        finalTransitions: [],
        withdrawnTransitions: [],
        statusChanges: [],
        newProposals: [],
        contentHashChanges: [],
      },
      signalLayer: {
        discussionHeat: [{
          proposalId: "EIP-8141",
          title: "Frame Transaction",
          status: "Draft",
          theme: "Transaction Model / Execution",
          discussionUrl: "https://ethereum-magicians.org/t/frame-transaction/27617",
          discussionLinks: ["https://ethereum-magicians.org/t/frame-transaction/27617"],
          discussionScore: 80,
          discussionActivityScore: 80,
          discussionTitle: "EIP-8141: Frame Transaction",
          discussionSource: "Ethereum Magicians",
          discussionLastActivityAt: "2026-07-19T00:00:00.000Z",
          discussionReplyCount: 96,
          discussionParticipantCount: 29,
          activityLevel: "High",
          whyItMatters: "Fresh activity suggests the proposal is still being debated or refined.",
          canonicalUrl: "https://example.test/EIP-8141",
        }],
        diffIntelligence: [],
      },
      narrativeLayer: {
        weeklyNarrative: ["Ethereum execution-specs contains implementation tracking references, but verified client code support has not yet been established."],
        topStories: [],
        signalEvidence: { topMomentumThemes: [], topDiscussions: [], recentChangeCount: 0, contentDiffCount: 0 },
        generatedBy: "deterministic",
      },
      watchlistLayer: {
        generatedBy: "deterministic",
        items: [{
          title: "Frame Transaction follow-through",
          theme: "Transaction Model / Execution",
          relatedProposals: ["EIP-8141"],
          signalType: "discussion_heat",
          possibleNextMovement: "Discussion heat is high, but no spec diff was detected this week.",
          confidence: "Medium",
          confidenceScore: 60,
          evidence: ["EIP-8141: 96 replies, 29 participants", "No content diff detected this week."],
          monitorNext: ["EIP-8141 content diff"],
        }],
      },
      adoptionLayer: { generatedBy: "github_search", collectionStatus: "collected", items: adoptionItems },
    },
    kgldOpportunityRadar: {
      method: "rule-based-scoring",
      candidates: [{
        proposalId: "EIP-8141",
        title: "Frame Transaction",
        status: "Draft",
        sourceRepo: "ethereum/EIPs",
        canonicalUrl: "https://example.test/EIP-8141",
        matchedKeywords: ["transaction", "execution"],
        matchedThemes: ["Transaction Model / Execution"],
        relevanceScore: 45,
        oneLineSummary: "Execution model signal.",
        whyRelevantToKGLD: "Execution-boundary changes may affect settlement monitoring.",
        potentialUseCases: ["KGLD Wallet UX"],
        businessImpact: 40,
        implementationEffort: 60,
        urgency: 30,
        recommendedAction: "monitor",
        reasonCodes: ["execution"],
      }],
    },
    chartData: {
      statusDistribution: { labels: [], data: [] },
      developerMomentumScores: { labels: [], data: [] },
      weeklyEventTypeDistribution: { labels: [], data: [] },
      themeDistribution180d: { labels: [], data: [] },
      subTrendDistributionByTheme: {},
      accountAbstractionSubTrendDistribution: { labels: [], data: [] },
      kgldOpportunityMatrix: [],
      kgldRecommendedActionDistribution: { labels: [], data: [] },
      topOpportunities: [],
    },
  };
}

function theme(): ThemeInsight {
  return {
    theme: "Transaction Model / Execution",
    proposalCount: 1,
    proposalCount180d: 1,
    recentChangeCount: 0,
    recentChangeCount7d: 0,
    discussionProposalCount: 1,
    contentChangeCount: 0,
    maturitySignal: "low",
    momentumScore: 41,
    dominantSubTrends: [{ name: "Transaction framing", count: 1, description: "Frame transaction work." }],
    representativeProposals: [{
      id: "EIP-8141",
      title: "Frame Transaction",
      status: "Draft",
      oneLineSummary: "Frame transaction",
      canonicalUrl: "https://example.test/EIP-8141",
    }],
    trendInterpretation: "Momentum signal.",
    interpretation: "Momentum signal.",
  };
}
