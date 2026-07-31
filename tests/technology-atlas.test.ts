import assert from "node:assert/strict";
import test from "node:test";
import { generateWeeklyHtml } from "../src/html-report.ts";
import { buildTechnologyAtlas } from "../src/technology-atlas.ts";
import type { WeeklyRadarReport } from "../src/types.ts";

test("Technology Atlas classifies evidence into bounded primary and secondary domains", () => {
  const report = atlasFixtureReport();
  const atlas = buildTechnologyAtlas(report);

  assert.equal(atlas.domains.length, 8);
  assert.ok(atlas.classifiedProposals.length >= 6);
  assert.ok(atlas.classifiedProposals.every((proposal) => proposal.primaryDomain === undefined || typeof proposal.primaryDomain === "string"));
  assert.ok(atlas.classifiedProposals.every((proposal) => proposal.secondaryDomains.length <= 2));
  assert.ok(atlas.classifiedProposals.every((proposal) => proposal.technologies.length <= 3));
  assert.equal(atlas.diagnostics.duplicateTechnologyProposalListCount, 0);

  const blockAccess = atlas.classifiedProposals.find((proposal) => proposal.proposalId === "EIP-7928");
  assert.ok(blockAccess);
  assert.equal(blockAccess.primaryDomain, "execution-state");
  assert.notEqual(blockAccess.primaryDomain, "accounts-wallets");
  assert.ok(blockAccess.technologies.some((technology) => /Access List|Block-Level Access Lists|State Access/.test(technology)));
});

test("Technology Atlas separates maturity from Final status and keeps relationships evidence-backed", () => {
  const atlas = buildTechnologyAtlas(atlasFixtureReport());
  const maturityPayload = JSON.stringify(atlas.maturity);
  assert.doesNotMatch(maturityPayload, /도입·활용|구현 확산|활발한 실험|초기 탐색/);
  assert.ok(atlas.relationships.length > 0);
  assert.ok(atlas.relationships.every((relation) => relation.evidenceProposalIds.length > 0));
  assert.ok(atlas.relationships.every((relation) => relation.confidence >= 55));
  assert.ok(atlas.relationships.every((relation) => relation.sourceTechnology !== relation.targetTechnology));
});

test("Technology Atlas HTML renders required visualizations and avoids old weekly-first IA", () => {
  const html = generateWeeklyHtml(atlasFixtureReport());
  const visible = html
    .replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<script type="application\/json" id="technology-platform-api">[\s\S]*?<\/script>/, "")
    .replace(/<!-- EIPreporter atlas chart data: [\s\S]*? -->/, "")
    .replace(/<script>[\s\S]*?<\/script>/, "");

  assert.match(html, /atlas-domain-grid/);
  assert.match(html, /Technology Landscape/);
  assert.match(html, /Focus & Progress/);
  assert.match(html, /Developer Attention/);
  assert.match(html, /atlas-chart-frame/);
  assert.doesNotMatch(html, /atlasTechnologyDistributionChart/);
  assert.doesNotMatch(html, /atlas-node-map/);
  assert.match(html, /five-lane/);
  assert.doesNotMatch(visible, /Evolution Timeline|Current Era/);
  assert.doesNotMatch(visible, /EIP-1930: EIP-1930/);
});

test("Technology Atlas avoids domain-default technology copying and known false classifications", () => {
  const atlas = buildTechnologyAtlas(regressionAtlasReport());
  const byId = new Map(atlas.classifiedProposals.map((proposal) => [proposal.proposalId, proposal]));

  for (const id of ["EIP-2542", "EIP-7976", "EIP-7981", "ERC-8330"]) {
    assert.notEqual(byId.get(id)?.primaryDomain, "governance-process", `${id} must not be governance`);
  }
  assert.equal(byId.get("EIP-2542")?.primaryDomain, "execution-state");
  assert.equal(byId.get("ERC-8330")?.primaryDomain, "tokens-finance");
  assert.doesNotMatch((byId.get("ERC-6123")?.technologies ?? []).join(" "), /\bBlob\b|Data Availability/i);
  assert.doesNotMatch((byId.get("ERC-8056")?.technologies ?? []).join(" "), /\bBlob\b|Proof and Settlement/i);
  assert.equal(byId.get("EIP-8296")?.primaryDomain, "execution-state");
  assert.doesNotMatch((byId.get("EIP-8296")?.technologies ?? []).join(" "), /\bBlob\b/i);
  assert.doesNotMatch((byId.get("ERC-7303")?.technologies ?? []).join(" "), /\bBlob\b/i);
  assert.doesNotMatch((byId.get("ERC-8048")?.technologies ?? []).join(" "), /\bBlob\b/i);
  assert.doesNotMatch((byId.get("EIP-7773")?.technologies ?? []).join(" "), /\bBlob\b/i);
  assert.notEqual(byId.get("EIP-8310")?.primaryDomain, "validators-consensus");
  assert.doesNotMatch((byId.get("EIP-8243")?.technologies ?? []).join(" "), /RWA \/ Attestation/i);
  assert.ok(atlas.classifiedProposals.every((proposal) => proposal.technologies.length <= 3));
  assert.ok(atlas.classifiedProposals.every((proposal) => proposal.technologyEvidence.length === proposal.technologies.length));
  assert.ok(atlas.classifiedProposals.every((proposal) => proposal.technologyEvidence.every((item) => item.evidenceField && item.confidence > 0 && (item.matchedText || item.evidenceId))));
  assert.ok(atlas.classifiedProposals.every((proposal) => !atlas.domains.some((domain) => proposal.technologies.join("|") === domain.domain.technologies.join("|"))));
  assert.equal(atlas.diagnostics.repeatedTechnologySetCount, 0);
  assert.equal(atlas.relationships.some((edge) => /함께 관찰|co-occurrence|when both technologies are explicit/i.test(edge.explanationKo)), false);
  assert.equal(atlas.relationships.some((edge) => edge.sourceTechnology === "State Access" && edge.targetTechnology === "Block-Level Access Lists"), false);

  const eventTotal = Object.values(atlas.domains).reduce((sum, domain) => sum + domain.repositoryActivity180d + domain.discussionActivity180d, 0);
  assert.equal(eventTotal, atlas.domains.reduce((sum, domain) => sum + domain.activity180d, 0));
  assert.equal(eventTotal, 13);
});

function atlasFixtureReport(): WeeklyRadarReport {
  const events = [
    event("ERC-4337", "Account Abstraction Using Alt Mempool", "Review", "UserOperation bundler paymaster account abstraction wallet gas sponsorship"),
    event("EIP-7702", "Set EOA account code for delegated authorization", "Review", "delegation session key wallet authorization delegated authorization"),
    event("EIP-7928", "Block-Level Access Lists", "Draft", "block level access list state access execution client partial statefulness"),
    event("ERC-4626", "Tokenized Vault Standard", "Final", "tokenized vault requests redemption oracle pricing NAV reporting"),
    event("ERC-8328", "Compliance Event Logging", "Draft", "subject linked event log compliance logging restricted transfer attestation"),
    event("EIP-8292", "Post-Quantum Authentication", "Draft", "post quantum authentication signature aggregation validator consensus authentication"),
  ];
  return {
    generatedAt: "2026-07-28T00:00:00.000Z",
    trendPeriod: { from: "2026-01-29T00:00:00.000Z", to: "2026-07-28T00:00:00.000Z", days: 180 },
    changePeriod: { from: "2026-07-21T00:00:00.000Z", to: "2026-07-28T00:00:00.000Z", days: 7 },
    ethereumTechRadar: {
      latestSnapshot: { id: 1, collectedAt: "2026-07-28T00:00:00.000Z", proposalCount: events.length },
      totalProposals: events.length,
      proposalsByRepo: {},
      proposalsByStatus: {},
      proposalsByType: {},
      proposalsByCategory: {},
      trendProposalCount: events.length,
      themeInsights: [
        theme("Account Abstraction / Wallet UX", events.slice(0, 2)),
        theme("Transaction Model / Execution", [events[2]!]),
        theme("DeFi / Vault", [events[3]!]),
        theme("Identity / Compliance", [events[4]!]),
        theme("Consensus / Validator", [events[5]!]),
      ],
      accountAbstractionRadar: { proposalCount: 0, subTrendDistribution: {}, representativeProposals: [], trendInterpretation: "", kgldWalletUxInterpretation: "" },
      recentChanges: {
        total: events.length,
        byEventType: { new_proposal: 1, status_change: 1, final_transition: 0, withdrawn_transition: 0, content_hash_change: 4 },
        newProposals: [events[5]!],
        statusChanges: [events[1]!],
        finalTransitions: [],
        withdrawnTransitions: [],
        contentHashChanges: [events[0]!, events[2]!, events[3]!, events[4]!],
      },
      signalLayer: {
        generatedBy: "deterministic",
        topStories: [],
        diffIntelligence: events.map((item) => ({ proposalId: item.proposalId, title: item.title, changedFiles: [item.sourcePath], changedSections: ["Specification"], diffSummary: item.diffSummary, diffEvidence: item.diffEvidence, canonicalUrl: item.canonicalUrl })),
        discussionHeat: events.map((item) => ({ proposalId: item.proposalId, title: item.title, status: item.currentStatus, theme: item.diffSummary, discussionUrl: item.canonicalUrl, discussionLinks: [item.canonicalUrl], discussionScore: 20, discussionActivityScore: 60, whyItMatters: item.diffSummary, canonicalUrl: item.canonicalUrl })),
        accountAbstraction: undefined,
        kgldAssessments: [],
        followUps: [],
      },
      technologyPlatformLayer: undefined,
      watchlistLayer: undefined,
      adoptionLayer: {
        generatedBy: "fallback",
        collectionStatus: "fallback",
        items: [],
      },
      topicClusterLayer: undefined,
      knowledgeGraphLayer: undefined,
      narrativeLayer: undefined,
      ecosystemStateLayer: undefined,
      intelligenceLayer: undefined,
    },
    kgldOpportunityRadar: { candidates: [], highPriority: [], summary: "fixture" },
    chartData: { themeDistribution180d: { labels: [], data: [] }, weeklyEventTypeDistribution: { labels: [], data: [] }, developerMomentumScores: { labels: [], data: [] } },
    summary: { telegram: "" },
  } as unknown as WeeklyRadarReport;
}

function regressionAtlasReport(): WeeklyRadarReport {
  const changes = [
    event("EIP-2542", "New opcodes TXGASLIMIT and CALLGASLIMIT", "Draft", "Specification adds TXGASLIMIT and CALLGASLIMIT opcodes for gas limit handling in the EVM."),
    event("EIP-7976", "Increase Calldata Floor Cost", "Draft", "Specification increases calldata floor cost and changes gas pricing for transaction calldata."),
    event("EIP-7981", "Increase Access List Cost", "Draft", "Specification increases access list cost and gas accounting for state access."),
    event("EIP-7778", "Block Gas Accounting without Refunds", "Draft", "Specification changes block gas accounting and removes refund effects."),
    event("EIP-7864", "Ethereum state using a unified binary tree", "Draft", "Specification defines Ethereum state using a unified binary tree for state tree and statelessness work."),
    event("ERC-8330", "Subject-Linked NAV Snapshot Oracle", "Draft", "Specification defines a subject-linked NAV snapshot oracle for pricing and RWA valuation."),
    event("ERC-8100", "Representable Contract State", "Draft", "Specification defines representable contract state for contract state representation."),
    event("ERC-6123", "Smart Derivative Contract", "Draft", "Specification defines a smart derivative contract interface for tokenized derivative claims."),
    event("ERC-8056", "Scaled UI Amount Extension for ERC-20 Tokens", "Draft", "Specification defines a scaled UI amount extension for ERC-20 tokens."),
    event("EIP-8296", "Fixed-Cutoff State Tiering", "Draft", "Specification defines fixed cutoff state tiering for state management."),
    event("ERC-7303", "Token-Controlled Token Circulation", "Draft", "Token circulation rules are controlled by token transfer policy."),
    event("ERC-8048", "Onchain Metadata for Token Registries", "Draft", "Onchain metadata for token registries and registry records."),
    event("EIP-7773", "Hardfork Meta - Glamsterdam", "Draft", "Meta proposal for hardfork inclusion stages and scheduling."),
    event("EIP-8310", "Post-Quantum Keystore for Stateful Keys", "Draft", "Keystore and key management for stateful keys."),
    event("EIP-8243", "Batching Attestations at Source", "Draft", "Consensus attestation batching at source for validators."),
  ];
  const historical = event("EIP-2", "Homestead Hard-fork Changes", "Final", "Historical EVM gas and transaction validity changes.");
  const report = atlasFixtureReport();
  report.ethereumTechRadar.recentChanges = {
    total: changes.length,
    byEventType: { new_proposal: 0, status_change: 0, final_transition: 0, withdrawn_transition: 0, content_hash_change: changes.length },
    newProposals: [],
    statusChanges: [],
    finalTransitions: [],
    withdrawnTransitions: [],
    contentHashChanges: changes as never,
  };
  report.ethereumTechRadar.signalLayer.diffIntelligence = changes.map((item) => ({ proposalId: item.proposalId, title: item.title, changedFiles: [item.sourcePath], changedSections: ["Specification"], diffSummary: item.diffSummary, diffEvidence: item.diffEvidence, canonicalUrl: item.canonicalUrl }));
  report.ethereumTechRadar.signalLayer.discussionHeat = [];
  report.ethereumTechRadar.themeInsights = [
    theme("Execution / Gas", changes.filter((item) => item.proposalId.startsWith("EIP-"))) as never,
    theme("Token / RWA", changes.filter((item) => item.proposalId.startsWith("ERC-"))) as never,
    theme("Historical", [historical]) as never,
  ];
  return report;
}

function event(proposalId: string, title: string, status: string, text: string) {
  return {
    type: "content_hash_change",
    proposalId,
    title,
    previousStatus: status,
    currentStatus: status,
    detectedAt: "2026-07-28T00:00:00.000Z",
    canonicalUrl: `https://example.test/${proposalId}`,
    sourcePath: `${proposalId}.md`,
    diffSummary: text,
    diffEvidence: text,
    changedSections: ["Specification"],
  };
}

function theme(name: string, events: ReturnType<typeof event>[]) {
  return {
    theme: name,
    proposalCount180d: events.length,
    momentumScore: 60,
    recentChangeCount7d: events.length,
    finalizationCount180d: 0,
    maturitySignal: "medium",
    topStatuses: [],
    dominantSubTrends: [],
    representativeProposals: events.map((item) => ({
      id: item.proposalId,
      title: item.title,
      status: item.currentStatus,
      canonicalUrl: item.canonicalUrl,
      oneLineSummary: item.diffSummary,
    })),
    trendInterpretation: name,
    interpretation: name,
  };
}

