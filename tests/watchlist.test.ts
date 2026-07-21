import assert from "node:assert/strict";
import test from "node:test";
import { buildAdoptionLayer } from "../src/adoption.ts";
import { generateWeeklyHtml } from "../src/html-report.ts";
import { buildWatchlistLayer } from "../src/watchlist.ts";
import type { ThemeInsight, WatchlistItem, WeeklyRadarReport } from "../src/types.ts";

test("generates EIP-8141 watchlist item from high discussion heat evidence", () => {
  const watchlist = buildWatchlistLayer(makeReport());
  const item = watchlist.items.find((candidate) => candidate.relatedProposals.includes("EIP-8141"));

  assert.equal(watchlist.generatedBy, "deterministic");
  assert.ok(item);
  assert.equal(item.title, "Frame Transaction follow-through");
  assert.equal(item.theme, "Transaction Model / Execution");
  assert.equal(item.confidence, "Medium");
  assert.equal(item.confidenceScore, 60);
  assert.equal(item.changeSinceLastReport, "Unknown");
  assert.ok(item.evidence.some((evidence) => /EIP-8141: 96 replies, 29 participants/.test(evidence)));
  assert.ok(item.evidence.some((evidence) => /Last active 2026-07-19/.test(evidence)));
  assert.deepEqual(
    ["EIP-8250", "EIP-8266", "EIP-8272"].every((proposalId) => item.relatedProposals.includes(proposalId)),
    true,
  );
});

test("zero recent diff prevents unsupported High confidence", () => {
  const report = makeReport();
  report.ethereumTechRadar.signalLayer.diffIntelligence = [];
  report.ethereumTechRadar.recentChanges.statusChanges = [];

  const item = buildWatchlistLayer(report).items.find((candidate) => candidate.relatedProposals.includes("EIP-8141"));

  assert.ok(item);
  assert.notEqual(item.confidence, "High");
  assert.ok(item.evidence.some((evidence) => /No content diff detected this week/.test(evidence)));
});

test("watchlist avoids unsupported claims and does not attach KGLD relevance to EIP-8141", () => {
  const item = buildWatchlistLayer(makeReport()).items.find((candidate) => candidate.relatedProposals.includes("EIP-8141"));
  assert.ok(item);

  const text = [
    item.title,
    item.possibleNextMovement,
    ...item.evidence,
    ...item.monitorNext,
    item.businessRelevance?.area ?? "",
    item.businessRelevance?.note ?? "",
  ].join("\n");

  assert.doesNotMatch(text, /\b(adopted|adoption|implemented by|production use|mainnet usage|ecosystem support|client support|price impact|token price)\b/i);
  assert.notEqual(item.businessRelevance?.area, "KGLD");
});

test("adoption layer fallback marks EIP-8141 evidence as unknown without external collection", () => {
  const originalToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  const report = makeReport();
  report.ethereumTechRadar.watchlistLayer = buildWatchlistLayer(report);

  try {
    const layer = buildAdoptionLayer(report);
    const item = layer.items.find((candidate) => candidate.proposalId === "EIP-8141");

    assert.equal(layer.generatedBy, "fallback");
    assert.ok(item);
    assert.equal(item.evidenceLevel, "Unknown");
    assert.equal(item.evidenceScore, 0);
    assert.equal(item.sources.length, 0);
    assert.match(item.summary, /No implementation or external reference evidence collected in this run/);
    assert.match(item.caution, /Treat as discussion\/momentum signal/);
  } finally {
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  }
});

test("HTML renders refined watchlist summary, compact cards, and structured actions", () => {
  const report = makeReport();
  report.ethereumTechRadar.watchlistLayer = buildWatchlistLayer(report);
  const html = generateWeeklyHtml(report);
  const frameCard = html.slice(html.indexOf("Frame Transaction follow-through"), html.indexOf("Network Upgrade / Governance follow-through"));

  assert.match(html, /관찰 목록 \/ 다음 신호/);
  assert.match(html, /구현·채택 근거/);
  assert.match(html, /채택 근거:<\/b> 확인 불가/);
  assert.match(html, /이번 실행에서 구현 또는 외부 참조 근거가 수집되지 않았습니다/);
  assert.match(html, /현재 watchlist 신호는 discussion\/momentum 기반으로 유지됩니다/);
  assert.match(html, /최우선 관찰 신호[\s\S]*Frame Transaction follow-through/);
  assert.match(html, /최고 신뢰도[\s\S]*중간 60\/100/);
  assert.match(html, /관찰 항목 수[\s\S]*3/);
  assert.match(html, /명세 변경 신호[\s\S]*문안 변경 0건/);
  assert.match(html, /주요 모드[\s\S]*discussion\/momentum 기반/);
  assert.match(html, /discussion 활동이 강하지만 content diff나 status movement가 없으면 신뢰도는 상한을 둡니다\./);
  assert.match(html, /신뢰도 중간 60\/100/);
  assert.match(html, /Frame Transaction follow-through/);
  assert.match(html, /<span class="evidence-chip">댓글 96개<\/span>/);
  assert.match(html, /<span class="evidence-chip">참여자 29명<\/span>/);
  assert.match(html, /<span class="evidence-chip">관련 proposal 5건<\/span>/);
  assert.match(html, /<span class="evidence-chip">이번 주 diff 0건<\/span>/);
  assert.match(frameCard, /EIP-8141 content diff/);
  assert.match(frameCard, /EIP-8250 \/ EIP-8266 \/ EIP-8272 변경/);
  assert.match(frameCard, /Ethereum Magicians 신규 댓글/);
  assert.doesNotMatch(frameCard, /<li>status movement<\/li>/);
  assert.match(html, /이전 기준값 없음/);
  assert.match(html, /EIP-8141을 다음 주 주요 관찰 신호로 추적/);
  assert.match(html, /<b>이유:<\/b> discussion heat는 높지만 이번 주 spec diff는 감지되지 않았습니다\./);
  assert.match(html, /<b>근거:<\/b> EIP-8141: 댓글 96개, 참여자 29명\. 마지막 활동 2026-07-19/);
  assert.match(html, /<b>다음 확인 항목:<\/b> EIP-8141 content diff; EIP-8250 \/ EIP-8266 \/ EIP-8272 변경; Ethereum Magicians 신규 댓글/);
  assert.doesNotMatch(html, /<b>Watch theme<\/b>/);
  assert.match(html, /EIP-8141은 확인된 구현 근거가 없으므로/);
  assert.match(html, /신호 유형:<\/b> discussion\/momentum 신호/);
  assert.match(html, /protocol \/ wallet execution-boundary/);
  assert.doesNotMatch(html, /[湲蹂理]|쨌|�/);
  assert.doesNotMatch(html, /Goldstation/);
  assert.doesNotMatch(html, /Hana/i);
  assert.doesNotMatch(html, /Netflix/);
  assert.doesNotMatch(html, /Continue Watching|Watch Now|Trailer|Season|Episode|>Play</);
  assert.doesNotMatch(html, /\b(adopted|adoption across|implemented by|production use|mainnet usage|ecosystem support|client support|price impact|token price|market impact)\b/i);
});

test("WatchlistItem supports week-over-week baseline fields", () => {
  const item = buildWatchlistLayer(makeReport()).items[0];
  const typedItem: WatchlistItem = {
    ...item,
    previousConfidenceScore: 50,
    previousActivityScore: 70,
    changeSinceLastReport: "Up",
  };

  assert.equal(typedItem.previousConfidenceScore, 50);
  assert.equal(typedItem.previousActivityScore, 70);
  assert.equal(typedItem.changeSinceLastReport, "Up");
});

test("Recommended Actions are limited to top 4 structured action cards", () => {
  const report = makeReport();
  const base = buildWatchlistLayer(report).items[0];
  report.ethereumTechRadar.watchlistLayer = {
    generatedBy: "deterministic",
    items: Array.from({ length: 5 }, (_, index) => ({
      ...base,
      title: `Signal ${index + 1}`,
      theme: index === 0 ? base.theme : "Wallet UX",
      relatedProposals: [`EIP-${9000 + index}`],
    })),
  };

  const html = generateWeeklyHtml(report);
  const actionSection = html.slice(html.indexOf('id="recommended-actions"'));
  const actionCardCount = (actionSection.match(/recommendation-card/g) ?? []).length;

  assert.equal(actionCardCount, 4);
});

function makeReport(): WeeklyRadarReport {
  return {
    generatedAt: "2026-07-20T00:00:00.000Z",
    trendPeriod: { from: "2026-01-21T00:00:00.000Z", to: "2026-07-20T00:00:00.000Z", days: 180 },
    changePeriod: { from: "2026-07-13T00:00:00.000Z", to: "2026-07-20T00:00:00.000Z", days: 7 },
    ethereumTechRadar: {
      latestSnapshot: { id: 1, collectedAt: "2026-07-20T00:00:00.000Z", proposalCount: 12 },
      totalProposals: 12,
      proposalsByRepo: {},
      proposalsByStatus: {},
      proposalsByType: {},
      proposalsByCategory: {},
      trendProposalCount: 12,
      themeInsights: [
        theme("Network Upgrade / Governance", 47, ["EIP-8134", "EIP-8135", "EIP-8133", "EIP-8138"]),
        theme("Transaction Model / Execution", 41, ["EIP-8266", "EIP-8272", "EIP-8250", "EIP-8209", "EIP-8141"]),
        theme("EVM / Gas / Opcode", 40, ["EIP-8163", "EIP-8200", "EIP-8173", "EIP-8149"]),
      ],
      accountAbstractionRadar: {
        proposalCount: 0,
        subTrendDistribution: {},
        representativeProposals: [],
        trendInterpretation: "",
        kgldWalletUxInterpretation: "",
      },
      recentChanges: {
        total: 0,
        byEventType: {
          new_proposal: 0,
          status_change: 0,
          final_transition: 0,
          withdrawn_transition: 0,
          content_hash_change: 0,
        },
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
        weeklyNarrative: ["Watchlist 관점에서는 Frame Transaction cluster의 후속 문안 변화와 Network Upgrade / Governance 테마의 상태 변화를 함께 보는 것이 좋습니다."],
        topStories: [],
        signalEvidence: {
          topMomentumThemes: [],
          topDiscussions: [],
          recentChangeCount: 0,
          contentDiffCount: 0,
        },
        generatedBy: "deterministic",
      },
      watchlistLayer: undefined,
    },
    kgldOpportunityRadar: {
      method: "rule-based-scoring",
      candidates: [],
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

function theme(
  name: ThemeInsight["theme"],
  momentumScore: number,
  proposalIds: string[],
): ThemeInsight {
  return {
    theme: name,
    proposalCount: proposalIds.length,
    proposalCount180d: proposalIds.length,
    recentChangeCount: 0,
    recentChangeCount7d: 0,
    discussionProposalCount: proposalIds.length,
    contentChangeCount: 0,
    maturitySignal: "low",
    momentumScore,
    dominantSubTrends: [],
    representativeProposals: proposalIds.map((id) => ({
      id,
      title: id === "EIP-8141" ? "Frame Transaction" : `${id} related proposal`,
      status: "Draft",
      oneLineSummary: "Related proposal",
      canonicalUrl: `https://example.test/${id}`,
    })),
    trendInterpretation: "Momentum signal.",
    interpretation: "Momentum signal.",
  };
}
