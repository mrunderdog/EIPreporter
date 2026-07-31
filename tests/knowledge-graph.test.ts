import assert from "node:assert/strict";
import test from "node:test";
import { generateWeeklyDebugJson, generateWeeklyHtml } from "../src/html-report.ts";
import { buildKnowledgeGraphLayer, getKnowledgeBusinessImpacts, getKnowledgeConceptNeighborhood, getKnowledgeNodesByType, getKnowledgeOutgoingEdges } from "../src/knowledge-graph.ts";
import type { NarrativeIntelligenceDebug, NarrativeParagraph } from "../src/narrative-intelligence.ts";
import { buildThemeGraph } from "../src/theme-graph.ts";
import { buildTopicClusterLayer } from "../src/topic-cluster.ts";
import { buildIntelligenceLayer } from "../src/signal-engine.ts";
import type { ChangeEvent, ProposalRecord, WeeklyRadarReport } from "../src/types.ts";

test("builds a concept-centered directed property graph from topic clusters", () => {
  const records = [
    proposal("EIP-7702", "Set EOA account code", "Delegated authorization for account abstraction wallets.", "Smart account delegation and scoped wallet permissions.", ["delegation", "wallet"]),
    proposal("ERC-9001", "Session key permissions", "Session key delegation for smart account wallet UX.", "Delegated authorization with expiry and limited permissions.", ["session key"]),
    proposal("EIP-7928", "Block-Level Access Lists", "Block access list support for partial statefulness.", "Execution clients validate block access list state witnesses.", ["block access list", "partial statefulness"]),
  ];
  const topicLayer = buildTopicClusterLayer({
    themeGraph: buildThemeGraph(records),
    changes: [change("EIP-7702", "status_change"), change("ERC-9001", "content_hash_change"), change("EIP-7928", "content_hash_change")],
  });
  const graph = buildKnowledgeGraphLayer({ topicLayer, proposals: records });

  assert.equal(graph.generatedBy, "deterministic_knowledge_graph");
  for (const type of ["Proposal", "Topic", "Concept", "Mechanism", "System", "Stakeholder", "BusinessImpact"] as const) {
    assert.ok(getKnowledgeNodesByType(graph, type).length > 0, `${type} nodes should exist`);
  }
  assert.ok(graph.edges.some((edge) => edge.type === "ENABLES"));
  assert.ok(graph.edges.some((edge) => edge.type === "AFFECTS"));
  assert.ok(graph.edges.some((edge) => edge.type === "USED_BY"));
  assert.ok(graph.edges.every((edge) => edge.traceability.topicIds.length > 0 || edge.traceability.evidenceIds.length > 0));
  assert.equal(graph.diagnostics.untracedEdgeCount, 0);
  assert.equal(graph.diagnostics.edgeCount, graph.edges.length);
  assert.equal(graph.diagnostics.nodeCount, graph.nodes.length);
  assert.ok(graph.diagnostics.inferredEdgeCount > 0);
  assert.ok(graph.edges.filter((edge) => edge.inferred).every((edge) => edge.traceability.source === "rule_inference"));

  const walletNeighborhood = getKnowledgeConceptNeighborhood(graph, "wallet");
  assert.ok(walletNeighborhood.nodes.some((node) => node.type === "Topic"));
  assert.ok(getKnowledgeOutgoingEdges(graph, graph.nodes.find((node) => node.type === "Topic")?.id ?? "").length > 0);
  assert.ok(getKnowledgeBusinessImpacts(graph).length > 0);
});

test("intelligence stories consume Knowledge Graph rather than Topic Cluster directly", () => {
  const records = [
    proposal("EIP-7702", "Set EOA account code", "Delegated authorization for account abstraction wallets.", "Smart account delegation and scoped wallet permissions.", ["delegation", "wallet"]),
    proposal("ERC-9001", "Session key permissions", "Session key delegation for smart account wallet UX.", "Delegated authorization with expiry and limited permissions.", ["session key"]),
  ];
  const topicLayer = buildTopicClusterLayer({
    themeGraph: buildThemeGraph(records),
    changes: [change("EIP-7702", "status_change"), change("ERC-9001", "content_hash_change")],
  });
  const graph = buildKnowledgeGraphLayer({ topicLayer, proposals: records });
  const report = reportWithGraph(records, graph);
  report.ethereumTechRadar.topicClusterLayer = { ...topicLayer, clusters: [], memberships: [] };

  const intelligence = buildIntelligenceLayer({ report, mode: "normal" });

  assert.ok(intelligence.topStories.length > 0);
  assert.match(intelligence.topStories[0]?.evidence.join("\n") ?? "", /graph|Topic|RELATES_TO|AFFECTS/);
});

test("Phase 13 canonicalization, extraction, edge rules, integrity, and payload separation", () => {
  const records = [
    proposal("ERC-4337", "Account Abstraction Using UserOperation", "Account abstraction introduces UserOperation, bundler, and paymaster gas sponsorship.", "The UserOperation is processed by a bundler and may use a paymaster.", ["account abstraction", "useroperation", "bundler", "paymaster"]),
    proposal("EIP-7702", "Set EOA account code", "Delegated account permission and authorization delegation for wallet authorization.", "Delegation enables smart account authorization without claiming adoption.", ["delegated authorization", "wallet"]),
    proposal("EIP-7928", "Block-Level Access Lists", "Block access list support for partial statefulness.", "Execution clients validate state witnesses and access lists.", ["block access list", "partial statefulness"]),
    proposal("ERC-4626", "Tokenized Vault Standard", "Tokenized vault and vault request behavior for deposits and redemption.", "Vault request flows can use transferable request semantics.", ["tokenized vault", "vault request"]),
    proposal("ERC-8328", "Compliance Event Logging", "Compliance event logging with subject-linked event log for restricted transfer.", "A subject-linked log can support compliance auditability.", ["compliance event", "subject-linked log"]),
    proposal("EIP-8292", "Post-Quantum Validator Authentication", "Post-quantum authentication and signature validation for validators.", "Validator authentication may use attestation aggregator and signature validation.", ["post-quantum", "signature validation"]),
  ];
  const topicLayer = buildTopicClusterLayer({
    themeGraph: buildThemeGraph(records),
    changes: records.map((item) => change(item.proposalId, "content_hash_change")),
  });
  const graph = buildKnowledgeGraphLayer({ topicLayer, proposals: records });

  assert.ok(graph.nodes.some((node) => node.id === "concept:delegated-authorization"));
  assert.ok(!graph.nodes.some((node) => node.id === "concept:standard"));
  assert.ok(graph.extractionCandidates.some((candidate) => candidate.label === "standard" && candidate.accepted === false));
  assert.equal(graph.nodes.find((node) => node.label === "Delegated Authorization")?.id, "concept:delegated-authorization");
  assert.ok(graph.nodes.some((node) => node.type === "Concept" && node.label === "Account Abstraction"));
  assert.ok(graph.nodes.some((node) => node.type === "Mechanism" && node.label === "UserOperation"));
  assert.ok(!graph.nodes.some((node) => node.type === "Concept" && node.label === "Account Abstraction Using UserOperation"));

  assert.ok(graph.edges.some((edge) => edge.type === "DESCRIBES"));
  assert.ok(graph.edges.some((edge) => edge.type === "INTRODUCES"));
  assert.ok(graph.edges.some((edge) => edge.type === "IMPLEMENTS"));
  assert.ok(graph.edges.some((edge) => edge.type === "RELEVANT_TO" && edge.inferred));
  assert.ok(graph.edges.filter((edge) => edge.inferred).every((edge) => edge.limitations.length > 0 && Boolean(edge.properties.inferenceRule)));
  assert.ok(graph.edges.every((edge) => edge.confidence <= 100 && edge.confidence >= 0 && !Number.isNaN(edge.confidence)));
  assert.ok(graph.edges.filter((edge) => edge.properties.ruleFamily === "conservative operational inference").every((edge) => edge.confidence <= 55 || edge.type === "AFFECTS"));
  assert.ok(!graph.edges.some((edge) => edge.type === "DEPENDS_ON" && edge.derivedFrom.includes("semantic_similarity_only")));
  assert.ok(graph.rejectedEdgeCandidates.some((edge) => edge.type === "DEPENDS_ON" && edge.derivedFrom.includes("semantic_similarity_only")));
  assert.equal(new Set(graph.nodes.map((node) => node.id)).size, graph.nodes.length);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  assert.ok(graph.edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)));
  assert.ok(graph.topicKnowledgePaths.every((path) => path.steps.length >= 3 || path.gaps.length > 0));
  assert.ok(graph.topicKnowledgePaths.filter((path) => path.steps.length >= 4).length >= 3);
  assert.ok(graph.diagnostics.regressionAssertions.every((item) => item.passed));

  const report = reportWithGraph(records, graph);
  const html = generateWeeklyHtml(report);
  const api = JSON.parse(html.match(/<script type="application\/json" id="technology-platform-api">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
  assert.equal(api.knowledgeGraphSummary, undefined);
  assert.equal(api.publishedKnowledgeNodes, undefined);
  assert.equal(api.publishedKnowledgeEdges, undefined);
  assert.equal(api.topicKnowledgePaths, undefined);
  assert.equal(api.knowledgeGraphGaps, undefined);
  assert.equal(api.knowledgeGraphDiagnostics, undefined);
  assert.equal(api.rejectedEdgeCandidates, undefined);
  assert.equal(api.weakEdgeCandidates, undefined);
  assert.ok(Buffer.byteLength(html, "utf8") < 2_000_000);

  const debug = JSON.parse(generateWeeklyDebugJson(report));
  assert.ok(Array.isArray(debug.knowledgeGraphDebug.rejectedEdgeCandidates));
  assert.ok(Array.isArray(debug.knowledgeGraphDebug.weakEdgeCandidates));
  assert.ok(Array.isArray(debug.knowledgeGraphDebug.extractionCandidates));
  assert.ok(debug.knowledgeGraphDebug.graphValidation);
});

test("Phase 13.1 builds multi-hop causal chains and graph statistics for narrative preparation", () => {
  const records = [
    proposal("ERC-4337", "Account Abstraction Using UserOperation", "Account abstraction introduces UserOperation, bundler, and paymaster gas sponsorship.", "The UserOperation is processed by a bundler and may use a paymaster.", ["account abstraction", "useroperation", "bundler", "paymaster"]),
    proposal("EIP-7702", "Set EOA account code", "Delegated authorization and wallet authorization with delegation.", "Delegation can connect wallet authorization to smart account execution.", ["delegated authorization", "delegation", "wallet"]),
    proposal("EIP-7928", "Block-Level Access Lists", "Block access list support for partial statefulness.", "The block-level access list is executed by execution clients during block processing.", ["block access list", "partial statefulness"]),
    proposal("ERC-4626", "Tokenized Vault Requests", "Tokenized vault and vault request behavior for deposits and redemption.", "Transferable request mechanics are used by vault and settlement systems.", ["tokenized vault", "vault request", "transferable request"]),
  ];
  const topicLayer = buildTopicClusterLayer({
    themeGraph: buildThemeGraph(records),
    changes: records.map((item) => change(item.proposalId, "content_hash_change")),
  });
  const graph = buildKnowledgeGraphLayer({ topicLayer, proposals: records });

  assert.ok(graph.edges.some((edge) => edge.type === "USES_MECHANISM"));
  assert.ok(graph.edges.some((edge) => edge.type === "EXECUTES"));
  assert.ok(graph.proposalKnowledgeChains.length >= records.length);
  assert.ok(graph.proposalKnowledgeChains.some((chain) =>
    ["Proposal", "Concept", "Mechanism", "System", "Stakeholder", "BusinessImpact"].every((type) => chain.steps.some((step) => step.type === type))
  ));
  assert.ok(graph.proposalKnowledgeChains.every((chain) => chain.chainScore >= 0 && chain.chainScore <= 100));
  assert.ok(graph.graphStatistics.maxPathLength >= 6);
  assert.ok(graph.graphStatistics.averagePathLength > 3);
  assert.ok(graph.graphStatistics.mechanismCoverage >= 70);
  assert.ok(graph.graphStatistics.stakeholderCoverage >= 70);
  assert.ok(graph.graphStatistics.systemCoverage >= 70);
  assert.ok(graph.graphStatistics.conceptCoverage >= 70);
  assert.ok(Object.values(graph.narrativeChains).some((item) => item.primaryChain && item.topSupportingChains.length >= 0));

  const report = reportWithGraph(records, graph);
  const html = generateWeeklyHtml(report);
  assert.match(html, /Focus & Progress/);
  assert.doesNotMatch(html, /Knowledge Graph Trace \/ Graph Explorer/);
  assert.doesNotMatch(html, /Chain Score/);
  const api = JSON.parse(html.match(/<script type="application\/json" id="technology-platform-api">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
  assert.equal(api.graphStatistics, undefined);
  assert.equal(api.proposalKnowledgeChains, undefined);
  assert.equal(api.narrativeChains, undefined);
  const debug = JSON.parse(generateWeeklyDebugJson(report));
  assert.ok(debug.knowledgeGraphDebug.graphStatistics);
  assert.ok(Array.isArray(debug.knowledgeGraphDebug.proposalKnowledgeChains));
  assert.ok(debug.knowledgeGraphDebug.narrativeChains);
});

test("Phase 14 emits deterministic traceable narratives in debug JSON only", () => {
  const records = [
    proposal("ERC-4337", "Account Abstraction Using UserOperation", "Account abstraction introduces UserOperation, bundler, and paymaster gas sponsorship.", "The UserOperation is processed by a bundler and may use a paymaster.", ["account abstraction", "useroperation", "bundler", "paymaster"]),
    proposal("EIP-7702", "Set EOA account code", "Delegated authorization and wallet authorization with delegation.", "Delegation can connect wallet authorization to smart account execution.", ["delegated authorization", "delegation", "wallet"]),
    proposal("EIP-7928", "Block-Level Access Lists", "Block access list support for partial statefulness.", "The block-level access list is executed by execution clients during block processing.", ["block access list", "partial statefulness"]),
    proposal("ERC-4626", "Tokenized Vault Requests", "Tokenized vault and vault request behavior for deposits and redemption.", "Transferable request mechanics are used by vault and settlement systems.", ["tokenized vault", "vault request", "transferable request"]),
    proposal("ERC-8328", "Compliance Event Logging", "Compliance event logging with subject-linked event log for restricted transfer.", "A subject-linked log can support compliance auditability.", ["compliance event", "subject-linked log"]),
  ];
  const topicLayer = buildTopicClusterLayer({
    themeGraph: buildThemeGraph(records),
    changes: records.map((item) => change(item.proposalId, "content_hash_change")),
  });
  const graph = buildKnowledgeGraphLayer({ topicLayer, proposals: records });
  const report = reportWithGraph(records, graph);
  report.ethereumTechRadar.topicClusterLayer = topicLayer;

  const html = generateWeeklyHtml(report);
  const api = JSON.parse(html.match(/<script type="application\/json" id="technology-platform-api">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
  assert.equal(api.narrative, undefined);

  const debug = JSON.parse(generateWeeklyDebugJson(report)) as { narrative: NarrativeIntelligenceDebug };
  assert.ok(debug.narrative["executive.json"]);
  assert.ok(debug.narrative["topics.json"].length >= topicLayer.clusters.length);
  assert.ok(Array.isArray(debug.narrative["cross_topics.json"]));
  assert.ok(Array.isArray(debug.narrative["momentum.json"]));
  assert.ok(Array.isArray(debug.narrative["contradictions.json"]));
  assert.equal(debug.narrative["business.json"].length, 8);

  const paragraphs = [
    ...debug.narrative["executive.json"].paragraphs,
    ...debug.narrative["topics.json"].flatMap((item) => item.paragraphs),
    ...debug.narrative["cross_topics.json"].flatMap((item) => item.paragraphs),
    ...debug.narrative["momentum.json"].flatMap((item) => item.paragraphs),
    ...debug.narrative["contradictions.json"].flatMap((item) => item.paragraphs),
    ...debug.narrative["business.json"].flatMap((item) => item.paragraphs),
  ];
  assert.ok(paragraphs.length > 0);
  assert.ok(paragraphs.every(isTraceableParagraph));
  assert.ok(paragraphs.some((item) => item.supportingChainIds.length > 0 && item.supportingEvidenceIds.length > 0));
  assert.ok(debug.narrative["topics.json"].every((item) => item.paragraphs.every((paragraph) => paragraph.generatedFromRules.some((rule) => rule.startsWith("rule-topic-")))));
  assert.ok(debug.narrative["business.json"].every((item) => item.paragraphs.some((paragraph) => paragraph.ruleName === "rule-business-safeguard")));
  assert.doesNotMatch(JSON.stringify(debug.narrative), /\b(token price impact|price impact|will require migration|guarantees financial return|requires production migration)\b/i);
});

function isTraceableParagraph(paragraph: NarrativeParagraph): boolean {
  return Boolean(paragraph.id)
    && Boolean(paragraph.text)
    && Array.isArray(paragraph.supportingChainIds)
    && Array.isArray(paragraph.supportingEvidenceIds)
    && Number.isFinite(paragraph.confidence)
    && paragraph.confidence >= 0
    && paragraph.confidence <= 100
    && Array.isArray(paragraph.generatedFromRules)
    && paragraph.generatedFromRules.length > 0
    && Boolean(paragraph.ruleName);
}

function proposal(proposalId: string, title: string, description: string, bodyExcerpt: string, keywords: string[]): ProposalRecord {
  return {
    proposalId,
    number: Number(proposalId.replace(/\D/g, "")),
    title,
    status: "Draft",
    kind: proposalId.startsWith("ERC") ? "ERC" : "EIP",
    proposalType: proposalId.startsWith("ERC") ? "ERC" : "EIP",
    category: "Standards Track",
    created: "2026-07-01",
    updated: "2026-07-24",
    discussionTo: null,
    description,
    bodyExcerpt,
    keywords,
    sourceRepo: proposalId.startsWith("ERC") ? "ethereum/ercs" : "ethereum/EIPs",
    sourcePath: `${proposalId.startsWith("ERC") ? "ERCS" : "EIPS"}/${proposalId.toLowerCase()}.md`,
    canonicalUrl: `https://example.test/${proposalId}`,
    rawContentHash: "hash",
  };
}

function change(proposalId: string, type: ChangeEvent["type"]): ChangeEvent {
  return {
    id: Number(proposalId.replace(/\D/g, "")) || 1,
    snapshotId: 2,
    previousSnapshotId: 1,
    detectedAt: "2026-07-24T00:00:00.000Z",
    type,
    proposalId,
    previousStatus: "Draft",
    currentStatus: type === "status_change" ? "Review" : "Draft",
    previousHash: "old",
    currentHash: "new",
    title: proposalId,
    sourceRepo: proposalId.startsWith("ERC") ? "ethereum/ercs" : "ethereum/EIPs",
    sourcePath: `${proposalId.toLowerCase()}.md`,
    canonicalUrl: `https://example.test/${proposalId}`,
    changedFiles: [`${proposalId.toLowerCase()}.md`],
    changedSections: ["Specification"],
    diffSummary: "semantic change",
    diffEvidence: "semantic change",
  };
}

function reportWithGraph(records: ProposalRecord[], graph: ReturnType<typeof buildKnowledgeGraphLayer>): WeeklyRadarReport {
  const events = [change("EIP-7702", "status_change")];
  return {
    generatedAt: "2026-07-24T00:00:00.000Z",
    trendPeriod: { from: "2026-01-24T00:00:00.000Z", to: "2026-07-24T00:00:00.000Z", days: 180 },
    changePeriod: { from: "2026-07-17T00:00:00.000Z", to: "2026-07-24T00:00:00.000Z", days: 7 },
    ethereumTechRadar: {
      latestSnapshot: { id: 2, collectedAt: "2026-07-24T00:00:00.000Z", proposalCount: records.length },
      totalProposals: records.length,
      proposalsByRepo: {},
      proposalsByStatus: {},
      proposalsByType: {},
      proposalsByCategory: {},
      trendProposalCount: records.length,
      themeInsights: [],
      accountAbstractionRadar: {
        proposalCount: 0,
        subTrendDistribution: {},
        representativeProposals: [],
        trendInterpretation: "",
        kgldWalletUxInterpretation: "",
      },
      recentChanges: {
        total: events.length,
        byEventType: { new_proposal: 0, status_change: 1, final_transition: 0, withdrawn_transition: 0, content_hash_change: 0 },
        finalTransitions: [],
        withdrawnTransitions: [],
        statusChanges: events,
        newProposals: [],
        contentHashChanges: [],
      },
      signalLayer: { discussionHeat: [], diffIntelligence: [] },
      narrativeLayer: { weeklyNarrative: [], topStories: [], signalEvidence: { topMomentumThemes: [], topDiscussions: [], recentChangeCount: 1, contentDiffCount: 0 }, generatedBy: "fallback" },
      watchlistLayer: { generatedBy: "fallback", items: [] },
      adoptionLayer: { generatedBy: "fallback", collectionStatus: "collected", items: [] },
      knowledgeGraphLayer: graph,
      technologyPlatformLayer: {
        generatedBy: "deterministic",
        hiddenCardCount: 0,
        deduplicatedClaimCount: 0,
        staleEvidenceCount: 0,
        dataCompleteness: {
          status: "complete",
          requiredSourcesAttempted: 1,
          sourcesSucceeded: 1,
          sourcesFailed: 0,
          cacheHits: 0,
          staleCacheUse: 0,
          partialCollection: false,
          missingFields: [],
          enrichmentSkipped: [],
          rateLimitDegradation: false,
          explanation: "complete",
          collectionCompleteness: 100,
          confidenceMetrics: { collectionConfidence: 100, evidenceConfidence: 60, signalStrength: 50 },
        },
        sectionVisibility: [],
        lifecycleTimelines: [],
        lifecycleAxes: [],
        clientMatrices: [],
        releaseIntelligence: [],
        deploymentIntelligence: [],
        evidenceGraphs: [],
        themeIntelligence: [],
        technologyRadar: [],
        risks: [],
        confidence: [],
        kgldIntelligence: [],
        dashboard: {
          topMovers: [],
          emergingThemes: [],
          lifecycleProgress: [],
          implementationProgress: [],
          releaseWatch: [],
          activationWatch: [],
          businessImpact: [],
          kgldWatch: [],
          developerActivity: [],
          themeHeatmap: [],
          technologyRadar: [],
        },
        api: {
          lifecycle: [],
          lifecycleAxes: [],
          clientMatrix: [],
          evidenceGraph: [],
          themes: [],
          technologyRadar: [],
          dashboard: {
            topMovers: [],
            emergingThemes: [],
            lifecycleProgress: [],
            implementationProgress: [],
            releaseWatch: [],
            activationWatch: [],
            businessImpact: [],
            kgldWatch: [],
            developerActivity: [],
            themeHeatmap: [],
            technologyRadar: [],
          },
          dataCompleteness: {
            status: "complete",
            requiredSourcesAttempted: 1,
            sourcesSucceeded: 1,
            sourcesFailed: 0,
            cacheHits: 0,
            staleCacheUse: 0,
            partialCollection: false,
            missingFields: [],
            enrichmentSkipped: [],
            rateLimitDegradation: false,
            explanation: "complete",
          },
        },
      },
    },
    kgldOpportunityRadar: { method: "rule-based-scoring", candidates: [] },
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

