import assert from "node:assert/strict";
import test from "node:test";
import { buildAdoptionLayer } from "../src/adoption.ts";
import { buildNarrativeLayer, validateAiNarrativeLayer } from "../src/narrative.ts";
import { buildWatchlistLayer } from "../src/watchlist.ts";
import type { NarrativeLayer, WeeklyRadarReport } from "../src/types.ts";

test("generates deterministic narrative without OPENAI_API_KEY", () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const report = makeReport();
    const narrative = buildNarrativeLayer(report);

    assert.equal(narrative.generatedBy, "deterministic");
    assert.ok(narrative.weeklyNarrative.length >= 3);
    assert.match(narrative.weeklyNarrative.join("\n"), /180일 momentum/);
  } finally {
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
  }
});

test("narrative includes high-activity discussion evidence", () => {
  const narrative = buildNarrativeLayer(makeReport());
  const text = narrative.weeklyNarrative.join("\n");

  assert.match(text, /EIP-8141/);
  assert.match(text, /Frame Transaction/);
  assert.match(text, /96 replies/);
  assert.match(text, /29 participants/);
  assert.match(text, /last active 2026-07-19/);
  assert.equal(narrative.signalEvidence.topDiscussions[0]?.proposalId, "EIP-8141");
  assert.equal(narrative.signalEvidence.topDiscussions[0]?.theme, "Transaction Model / Execution");
});

test("narrative handles zero recent changes as a quiet spec week", () => {
  const report = makeReport();
  report.ethereumTechRadar.recentChanges.total = 0;
  report.ethereumTechRadar.signalLayer.diffIntelligence = [];

  const narrative = buildNarrativeLayer(report);
  assert.match(narrative.weeklyNarrative.join("\n"), /최근 7일 동안 proposal content diff는 감지되지 않았습니다/);
  assert.equal(narrative.signalEvidence.recentChangeCount, 0);
  assert.equal(narrative.signalEvidence.contentDiffCount, 0);
});

test("top technology stories are generated from discussion heat and momentum themes", () => {
  const narrative = buildNarrativeLayer(makeReport());
  const title = narrative.topStories[0]?.storyTitle ?? "";

  assert.ok(narrative.topStories.length >= 2);
  assert.equal(narrative.topStories[0]?.relatedProposals[0], "EIP-8141");
  assert.equal(title, "Frame Transactions Point to Execution Flexibility");
  assert.doesNotMatch(title, /Unclassified/);
  assert.doesNotMatch(title, /Developer Story/);
  assert.ok(narrative.topStories.some((story) => story.primaryTheme === "Network Upgrade / Governance"));
});

test("weekly narrative avoids adoption and implementation claims", () => {
  const narrative = buildNarrativeLayer(makeReport());
  const text = narrative.weeklyNarrative.join("\n");

  assert.doesNotMatch(text, /\b(adopted|adoption across|implemented by|production use|mainnet usage|ecosystem support)\b/i);
  assert.doesNotMatch(text, /client support/i);
});

test("narrative identifies missing adoption evidence as discussion momentum signal", () => {
  const report = makeReport();
  report.ethereumTechRadar.signalLayer.diffIntelligence = [];
  report.ethereumTechRadar.recentChanges.total = 0;
  report.ethereumTechRadar.watchlistLayer = buildWatchlistLayer(report);
  report.ethereumTechRadar.adoptionLayer = buildAdoptionLayer(report);

  const narrative = buildNarrativeLayer(report);
  const text = narrative.weeklyNarrative.join("\n");

  assert.match(text, /Adoption evidence는 아직 수집되지 않았거나 확인되지 않았으므로/);
  assert.match(text, /implementation signal이 아니라 discussion\/momentum signal/);
});

test("AI narrative validation rejects unsupported proposal ids and adoption claims", () => {
  const evidence = buildNarrativeLayer(makeReport()).signalEvidence;
  const valid: NarrativeLayer = {
    weeklyNarrative: ["Provided evidence indicates discussion momentum."],
    topStories: [{
      storyTitle: "Network Upgrade Governance Is Becoming More Formalized",
      primaryTheme: "Network Upgrade / Governance",
      relatedProposals: ["EIP-8141"],
      evidence: ["EIP-8141: High activity"],
      interpretation: "This suggests upgrade coordination remains worth watching.",
      watchNext: "Track discussion heat.",
    }],
    signalEvidence: evidence,
    generatedBy: "ai",
  };

  assert.equal(validateAiNarrativeLayer(valid, evidence), true);
  assert.equal(
    validateAiNarrativeLayer({
      ...valid,
      topStories: [{ ...valid.topStories[0]!, relatedProposals: ["EIP-9999"] }],
    }, evidence),
    false,
  );
  assert.equal(
    validateAiNarrativeLayer({
      ...valid,
      weeklyNarrative: ["This proposal has adoption across production wallets."],
    }, evidence),
    false,
  );
});

function makeReport(): WeeklyRadarReport {
  return {
    generatedAt: "2026-07-20T00:00:00.000Z",
    trendPeriod: { from: "2026-01-21T00:00:00.000Z", to: "2026-07-20T00:00:00.000Z", days: 180 },
    changePeriod: { from: "2026-07-13T00:00:00.000Z", to: "2026-07-20T00:00:00.000Z", days: 7 },
    ethereumTechRadar: {
      latestSnapshot: { id: 1, collectedAt: "2026-07-20T00:00:00.000Z", proposalCount: 2 },
      totalProposals: 2,
      proposalsByRepo: {},
      proposalsByStatus: {},
      proposalsByType: {},
      proposalsByCategory: {},
      trendProposalCount: 2,
      themeInsights: [
        {
          theme: "Network Upgrade / Governance",
          proposalCount: 18,
          proposalCount180d: 12,
          recentChangeCount: 1,
          recentChangeCount7d: 1,
          discussionProposalCount: 4,
          contentChangeCount: 1,
          maturitySignal: "high",
          momentumScore: 88,
          dominantSubTrends: [],
          representativeProposals: [{
            id: "EIP-9103",
            title: "Network upgrade metadata",
            status: "Draft",
            oneLineSummary: "Fork coordination metadata",
            canonicalUrl: "https://example.test/EIP-9103",
          }],
          trendInterpretation: "Upgrade coordination remains active.",
          interpretation: "Upgrade coordination remains active.",
        },
        {
          theme: "EVM / Gas / Opcode",
          proposalCount: 10,
          proposalCount180d: 7,
          recentChangeCount: 0,
          recentChangeCount7d: 0,
          discussionProposalCount: 2,
          contentChangeCount: 0,
          maturitySignal: "medium",
          momentumScore: 72,
          dominantSubTrends: [],
          representativeProposals: [{
            id: "EIP-7907",
            title: "Gas semantics refinement",
            status: "Draft",
            oneLineSummary: "Gas semantics refinement",
            canonicalUrl: "https://example.test/EIP-7907",
          }],
          trendInterpretation: "Execution-layer refinement remains active.",
          interpretation: "Execution-layer refinement remains active.",
        },
      ],
      accountAbstractionRadar: {
        proposalCount: 0,
        subTrendDistribution: {},
        representativeProposals: [],
        trendInterpretation: "",
        kgldWalletUxInterpretation: "",
      },
      recentChanges: {
        total: 1,
        byEventType: {
          new_proposal: 0,
          status_change: 0,
          final_transition: 0,
          withdrawn_transition: 0,
          content_hash_change: 1,
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
          discussionUrl: "https://ethereum-magicians.org/t/eip-8141/1",
          discussionLinks: ["https://ethereum-magicians.org/t/eip-8141/1"],
          discussionScore: 95,
          discussionActivityScore: 95,
          discussionTitle: "EIP-8141 discussion",
          discussionSource: "Ethereum Magicians",
          discussionLastActivityAt: "2026-07-19T00:00:00.000Z",
          discussionReplyCount: 96,
          discussionParticipantCount: 29,
          activityLevel: "High",
          whyItMatters: "High activity discussion.",
          canonicalUrl: "https://example.test/EIP-8141",
        }],
        diffIntelligence: [{
          proposalId: "EIP-8141",
          title: "Frame Transaction",
          changedFiles: ["EIPS/eip-8141.md"],
          changedSections: ["Specification"],
          diffSummary: "Specification text changed.",
          diffEvidence: "content hash changed",
          canonicalUrl: "https://example.test/EIP-8141",
        }],
      },
      narrativeLayer: {
        weeklyNarrative: [],
        topStories: [],
        signalEvidence: {
          topMomentumThemes: [],
          topDiscussions: [],
          recentChangeCount: 0,
          contentDiffCount: 0,
        },
        generatedBy: "fallback",
      },
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
