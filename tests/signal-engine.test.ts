import assert from "node:assert/strict";
import test from "node:test";
import { generateWeeklyHtml } from "../src/html-report.ts";
import { buildKnowledgeGraphLayer } from "../src/knowledge-graph.ts";
import { buildIntelligenceLayer } from "../src/signal-engine.ts";
import { buildThemeGraph } from "../src/theme-graph.ts";
import { buildTopicClusterLayer } from "../src/topic-cluster.ts";
import type { ChangeEvent, ProposalRecord, WeeklyRadarReport } from "../src/types.ts";

test("signal engine ranks material weekly changes and generates top stories", () => {
  const report = makeReport([
    change("status_change", "EIP-7702", "Draft", "Review", "status metadata changed between snapshots", "Frontmatter: status"),
    change("content_hash_change", "EIP-7702", "Review", "Review", "authorization semantics changed", "Specification"),
    change("content_hash_change", "EIP-9000", "Draft", "Draft", "formatting-only edit", "Frontmatter: updated"),
  ]);

  const layer = buildIntelligenceLayer({ report, mode: "normal" });

  assert.equal(layer.generatedBy, "deterministic_signal_engine");
  assert.equal(layer.events.some((event) => event.eventType === "NO_MEANINGFUL_CHANGE" && event.entity === "EIP-9000"), true);
  assert.equal(layer.topStories[0]?.relatedProposals.includes("EIP-7702"), true);
  assert.notEqual(layer.topStories[0]?.priority, "ARCHIVE");
  assert.match(layer.topStories[0]?.followUpTrigger ?? "", /Recheck|Escalate|Begin wallet/i);
});

test("signal engine produces Account Abstraction and KGLD causal intelligence", () => {
  const report = makeReport([
    change("content_hash_change", "EIP-7702", "Draft", "Draft", "wallet authorization and delegation normative text changed", "Specification"),
  ]);

  const layer = buildIntelligenceLayer({ report, mode: "normal" });

  assert.equal(layer.accountAbstraction.meaningful, true);
  assert.match(layer.accountAbstraction.walletImplication, /major wallet|bundler|paymaster|execution client/);
  assert.equal(layer.kgldAssessments.some((item) => item.relevance !== "none" && /wallet/.test(item.affectedComponent)), true);
  assert.equal(layer.followUpQueue.some((item) => item.owner === "wallet or custody"), true);
});

test("signal engine keeps quiet healthy weeks concise", () => {
  const report = makeReport([]);
  const layer = buildIntelligenceLayer({ report, mode: "normal" });

  assert.equal(layer.quietWeek, true);
  assert.equal(layer.topStories.length, 0);
  assert.equal(layer.followUpQueue.length <= 1, true);
  assert.match(layer.accountAbstraction.conclusion, /No evidence-based|without a meaningful weekly change/);
});

test("narrative generation clusters related proposal signals into a theme story", () => {
  const report = makeReport([
    change("status_change", "EIP-7702", "Draft", "Review", "wallet authorization status changed", "Frontmatter: status"),
    change("content_hash_change", "ERC-4337", "Review", "Review", "bundler and paymaster authorization semantics changed", "Specification"),
  ]);
  addRepresentative(report, "ERC-4337", "Account Abstraction", "Account Abstraction via EntryPoint");

  const layer = buildIntelligenceLayer({ report, mode: "normal" });
  const story = layer.topStories.find((item) => item.relatedProposals.includes("EIP-7702") && item.relatedProposals.includes("ERC-4337")) ?? layer.topStories[0];

  assert.match(story.headline, /Wallet and Account Abstraction|Account Abstraction/);
  assert.deepEqual(new Set(story.relatedProposals), new Set(["EIP-7702", "ERC-4337"]));
  assert.match(story.conclusion, /Wallet and Account Abstraction|wallet impact/i);
  assert.match(story.whyItMatters, /wallet authorization|signing|sponsorship/i);
});

test("top stories consume Knowledge Graph and do not publish the old wallet mega-cluster", () => {
  const reportedFalsePositiveRecords = [
    proposalRecord("ERC-1450", "Security Token Control", "restricted transfer compliance event for token controls", "Compliance and restricted transfer semantics."),
    proposalRecord("ERC-8196", "AI Agent Authenticated Wallet", "AI agent wallet authentication with passkey and delegated authorization.", "Smart account wallet policy for agentic actions."),
    proposalRecord("ERC-8161", "Transferable Tokenized Vault Requests", "ERC-4626 vault request redemption and settlement flow.", "Tokenized vault request standardization."),
    proposalRecord("ERC-1613", "Gasless transaction sponsorship", "Paymaster sponsorship and user operation fee handling.", "Account abstraction transaction sponsorship."),
    proposalRecord("EIP-8279", "ETH Transfer Observability", "execution-layer ETH transfer event observability", "Transaction execution observability."),
    proposalRecord("EIP-8298", "Block Access List resource accounting", "block access list and partial statefulness for execution clients", "State access and resource accounting."),
    proposalRecord("ERC-8325", "Asset Anchor Registry", "asset anchor registry for RWA attestations", "Asset registry and attestation records."),
    proposalRecord("EIP-7708", "Set EOA delegation extension", "delegated authorization for wallet account abstraction", "Wallet scoped permission model."),
  ];
  const report = makeReport(reportedFalsePositiveRecords.map((record) => change("new_proposal", record.proposalId, "", "Draft", record.description ?? "", "Specification")));
  report.ethereumTechRadar.topicClusterLayer = buildTopicClusterLayer({
    themeGraph: buildThemeGraph(reportedFalsePositiveRecords),
    changes: report.ethereumTechRadar.recentChanges.newProposals,
  });
  report.ethereumTechRadar.knowledgeGraphLayer = buildKnowledgeGraphLayer({
    topicLayer: report.ethereumTechRadar.topicClusterLayer,
    proposals: reportedFalsePositiveRecords,
    kgldCandidates: report.kgldOpportunityRadar.candidates,
  });

  const layer = buildIntelligenceLayer({ report, mode: "normal" });
  const headlines = layer.topStories.map((story) => story.headline).join("\n");
  const walletStory = layer.topStories.find((story) => story.headline === "Wallet Authorization Evolution");

  assert.doesNotMatch(headlines, /Wallet and Account Abstraction signals cluster across 8 proposals/);
  assert.doesNotMatch(headlines, /Unclassified clusters/);
  assert.ok(walletStory);
  assert.ok(!walletStory.relatedProposals.includes("ERC-8161"));
  assert.ok(!walletStory.relatedProposals.includes("ERC-8325"));
  assert.ok(layer.topStories.some((story) => story.headline === "Vault Request Standardization"));
  assert.ok(layer.topStories.some((story) => story.headline === "Asset Attestation and Registry Standards"));
});

test("trend detection compares current theme share with baseline before claiming acceleration", () => {
  const report = makeReport([
    change("status_change", "EIP-7702", "Draft", "Review", "wallet authorization status changed", "Frontmatter: status"),
    change("content_hash_change", "ERC-4337", "Review", "Review", "bundler and paymaster authorization semantics changed", "Specification"),
    change("new_proposal", "ERC-9999", undefinedStatus(), "Draft", "new smart account wallet proposal", "Specification"),
  ]);
  addRepresentative(report, "ERC-4337", "Account Abstraction", "Account Abstraction via EntryPoint");
  addRepresentative(report, "ERC-9999", "Account Abstraction", "Smart account permissions");
  report.ethereumTechRadar.themeInsights[0]!.proposalCount180d = 6;
  report.ethereumTechRadar.themeInsights[0]!.recentChangeCount7d = 3;
  report.ethereumTechRadar.themeInsights.push({
    theme: "EVM / Gas / Opcode",
    proposalCount: 20,
    proposalCount180d: 20,
    recentChangeCount: 0,
    recentChangeCount7d: 0,
    discussionProposalCount: 5,
    contentChangeCount: 0,
    maturitySignal: "low",
    momentumScore: 40,
    dominantSubTrends: [],
    representativeProposals: [],
    trendInterpretation: "Execution baseline.",
    interpretation: "Execution baseline.",
  });

  const layer = buildIntelligenceLayer({ report, mode: "normal" });
  const aa = layer.themeSignals.find((item) => item.theme === "Account Abstraction");
  const evm = layer.themeSignals.find((item) => item.theme === "EVM / Gas / Opcode");

  assert.equal(aa?.direction, "accelerating");
  assert.match(aa?.reasoning ?? "", /current changes versus/);
  assert.equal(evm?.direction, "slowing");
});

test("KGLD reasoning explains affected area, causal path, urgency, and recommendation", () => {
  const report = makeReport([
    change("content_hash_change", "EIP-7702", "Draft", "Draft", "wallet authorization and delegation normative text changed", "Specification"),
  ]);

  const layer = buildIntelligenceLayer({ report, mode: "normal" });
  const assessment = layer.kgldAssessments.find((item) => item.relevance !== "none");

  assert.equal(assessment?.affectedComponent, "wallet");
  assert.ok((assessment?.causalPath ?? "").length > 0);
  assert.ok((assessment?.requiredResponse ?? "").length > 0);
  assert.match(assessment?.followUpTrigger ?? "", /EIP-7702/);
  assert.equal(assessment?.recommendedAction, "MONITOR");
  assert.equal(assessment?.currentKgldDependency, "UNKNOWN");
});

test("high activity does not become action required without implementation or release evidence", () => {
  const report = makeReport([
    change("status_change", "EIP-7702", "Draft", "Review", "wallet authorization status changed", "Frontmatter: status"),
    change("content_hash_change", "EIP-7702", "Review", "Review", "wallet authorization discussion accelerated", "Wallet"),
  ]);

  const layer = buildIntelligenceLayer({ report, mode: "normal" });
  const story = layer.topStories[0];

  assert.ok(story);
  assert.notEqual(story.decisionState, "ACTION_REQUIRED");
  assert.notEqual(story.priority, "CRITICAL");
  assert.ok((story.confidenceMetrics?.signalStrength ?? 0) >= (story.confidenceMetrics?.evidenceConfidence ?? 0));
});

test("follow-up queue includes rationale instead of a bare proposal watch instruction", () => {
  const report = makeReport([
    change("content_hash_change", "EIP-7702", "Draft", "Draft", "wallet authorization and delegation normative text changed", "Specification"),
  ]);

  const layer = buildIntelligenceLayer({ report, mode: "normal" });
  const followUp = layer.followUpQueue[0];

  assert.ok((followUp?.rationale ?? "").length > 0);
  assert.ok((followUp?.recommendedResponse ?? "").length > 0);
});

test("executive summary uses ecosystem direction language in non-incident mode", () => {
  const report = makeReport([
    change("content_hash_change", "EIP-7702", "Draft", "Draft", "wallet authorization and delegation normative text changed", "Specification"),
  ]);
  report.ethereumTechRadar.intelligenceLayer = buildIntelligenceLayer({ report, mode: "normal" });

  const html = generateWeeklyHtml(report);

  assert.match(html, /Executive Pulse/);
  assert.match(html, /Ethereum 개발 인텔리전스/);
  assert.match(html, /Technology Landscape/);
  assert.match(html, /Focus & Progress/);
  assert.doesNotMatch(html, /기술 성숙도/);
});

function makeReport(events: ChangeEvent[]): WeeklyRadarReport {
  return {
    generatedAt: "2026-07-24T00:00:00.000Z",
    trendPeriod: { from: "2026-01-24T00:00:00.000Z", to: "2026-07-24T00:00:00.000Z", days: 180 },
    changePeriod: { from: "2026-07-17T00:00:00.000Z", to: "2026-07-24T00:00:00.000Z", days: 7 },
    ethereumTechRadar: {
      latestSnapshot: { id: 2, collectedAt: "2026-07-24T00:00:00.000Z", proposalCount: 2 },
      totalProposals: 2,
      proposalsByRepo: { "ethereum/EIPs": 2 },
      proposalsByStatus: { Draft: 1, Review: 1 },
      proposalsByType: { Standards: 2 },
      proposalsByCategory: { Core: 2 },
      trendProposalCount: 2,
      themeInsights: [
        {
          theme: "Account Abstraction",
          proposalCount: 1,
          proposalCount180d: 1,
          recentChangeCount: events.length,
          recentChangeCount7d: events.length,
          discussionProposalCount: 1,
          contentChangeCount: events.filter((event) => event.type === "content_hash_change").length,
          maturitySignal: "medium",
          momentumScore: 60,
          dominantSubTrends: [],
          representativeProposals: [
            { id: "EIP-7702", title: "Set EOA account code", status: "Review", oneLineSummary: "EOA delegation proposal", canonicalUrl: "https://eips.ethereum.org/EIPS/eip-7702" },
          ],
          trendInterpretation: "Account Abstraction proposal activity.",
          interpretation: "Account Abstraction proposal activity.",
        },
      ],
      accountAbstractionRadar: {
        proposalCount: 1,
        subTrendDistribution: { "Scoped delegation": 1 },
        representativeProposals: [
          { id: "EIP-7702", title: "Set EOA account code", status: "Review", oneLineSummary: "EOA delegation proposal", canonicalUrl: "https://eips.ethereum.org/EIPS/eip-7702" },
        ],
        trendInterpretation: "AA tracked.",
        kgldWalletUxInterpretation: "Wallet authorization review trigger only.",
      },
      recentChanges: {
        total: events.length,
        byEventType: {
          new_proposal: events.filter((event) => event.type === "new_proposal").length,
          status_change: events.filter((event) => event.type === "status_change").length,
          final_transition: 0,
          withdrawn_transition: 0,
          content_hash_change: events.filter((event) => event.type === "content_hash_change").length,
        },
        finalTransitions: [],
        withdrawnTransitions: [],
        statusChanges: events.filter((event) => event.type === "status_change"),
        newProposals: events.filter((event) => event.type === "new_proposal"),
        contentHashChanges: events.filter((event) => event.type === "content_hash_change"),
      },
      signalLayer: {
        discussionHeat: [],
        diffIntelligence: [],
      },
      narrativeLayer: { weeklyNarrative: [], topStories: [], signalEvidence: { topMomentumThemes: [], topDiscussions: [], recentChangeCount: events.length, contentDiffCount: 0 }, generatedBy: "fallback" },
      watchlistLayer: { generatedBy: "deterministic", items: [] },
      adoptionLayer: { generatedBy: "github_search", collectionStatus: "collected", items: [] },
    },
    kgldOpportunityRadar: {
      method: "rule-based-scoring",
      candidates: [
        {
          proposalId: "EIP-7702",
          title: "Set EOA account code",
          status: "Review",
          sourceRepo: "ethereum/EIPs",
          canonicalUrl: "https://eips.ethereum.org/EIPS/eip-7702",
          matchedKeywords: ["delegation", "wallet"],
          matchedThemes: ["Account Abstraction"],
          relevanceScore: 58,
          oneLineSummary: "EOA delegation may affect wallet authorization.",
          whyRelevantToKGLD: "Wallet authorization assumptions may need review.",
          potentialUseCases: ["KGLD Wallet UX"],
          businessImpact: 4,
          implementationEffort: 3,
          urgency: 3,
          recommendedAction: "review",
          reasonCodes: ["HIGH_WALLET_UX_KEYWORD"],
        },
      ],
    },
    chartData: {
      statusDistribution: { labels: [], data: [] },
      themeDistribution180d: { labels: [], data: [] },
      subTrendDistributionByTheme: {},
      accountAbstractionSubTrendDistribution: { labels: [], data: [] },
      weeklyEventTypeDistribution: { labels: [], data: [] },
      developerMomentumScores: { labels: [], data: [] },
      kgldOpportunityMatrix: [],
      kgldRecommendedActionDistribution: { labels: [], data: [] },
      topOpportunities: [],
    },
  };
}

function change(type: ChangeEvent["type"], proposalId: string, previousStatus: string, currentStatus: string, evidence: string, section: string): ChangeEvent {
  return {
    id: Math.floor(Math.random() * 100000),
    snapshotId: 2,
    previousSnapshotId: 1,
    detectedAt: "2026-07-24T00:00:00.000Z",
    type,
    proposalId,
    previousStatus,
    currentStatus,
    previousHash: "old",
    currentHash: "new",
    title: titleForChange(proposalId),
    sourceRepo: "ethereum/EIPs",
    sourcePath: `EIPS/${proposalId.toLowerCase()}.md`,
    canonicalUrl: `https://eips.ethereum.org/EIPS/${proposalId.toLowerCase()}`,
    changedFiles: [`EIPS/${proposalId.toLowerCase()}.md`],
    changedSections: [section],
    diffSummary: evidence,
    diffEvidence: evidence,
  };
}

function addRepresentative(report: WeeklyRadarReport, proposalId: string, theme: string, title: string): void {
  const insight = report.ethereumTechRadar.themeInsights.find((item) => item.theme === theme);
  if (!insight) return;
  insight.representativeProposals.push({
    id: proposalId,
    title,
    status: "Review",
    oneLineSummary: title,
    canonicalUrl: `https://eips.ethereum.org/EIPS/${proposalId.toLowerCase()}`,
  });
  insight.proposalCount += 1;
  insight.proposalCount180d += 1;
}

function undefinedStatus(): string {
  return "";
}

function titleForChange(proposalId: string): string {
  if (proposalId === "EIP-7702") return "Set EOA account code";
  if (proposalId === "ERC-4337") return "Account Abstraction via EntryPoint";
  if (proposalId === "ERC-9999") return "Smart account permissions";
  return "Formatting proposal";
}

function proposalRecord(proposalId: string, title: string, description: string, bodyExcerpt: string): ProposalRecord {
  const number = Number(proposalId.split("-")[1]);
  return {
    proposalId,
    kind: proposalId.startsWith("ERC") ? "ERC" : "EIP",
    number,
    title,
    status: "Draft",
    proposalType: "Standards Track",
    category: proposalId.startsWith("ERC") ? "ERC" : "Core",
    created: "2026-01-01",
    updated: null,
    discussionTo: null,
    description,
    bodyExcerpt,
    keywords: [],
    sourceRepo: proposalId.startsWith("ERC") ? "ethereum/ercs" : "ethereum/EIPs",
    sourcePath: `${proposalId.startsWith("ERC") ? "ERCS" : "EIPS"}/${proposalId.toLowerCase()}.md`,
    canonicalUrl: `https://example.test/${proposalId}`,
    rawContentHash: "hash",
  };
}

