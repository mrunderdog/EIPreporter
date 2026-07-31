import assert from "node:assert/strict";
import test from "node:test";
import { buildThemeGraph } from "../src/theme-graph.ts";
import {
  buildTopicClusterLayer,
  getDominantTopics,
  getEmergingTopics,
  getTopicCohesion,
  getTopicEvidence,
  getTopicForProposal,
  getTopicsForTheme,
  getUnclusteredProposals,
  getProposalThemeAssignments,
  validateThemeGraphEdges,
} from "../src/topic-cluster.ts";
import type { AdoptionLayer, ChangeEvent, ProposalRecord } from "../src/types.ts";

test("validates theme edges and penalizes generic keyword-only matches", () => {
  const graph = buildThemeGraph([
    proposal("EIP-8000", "Repository interface split", "Splits ERC and EIP repository interfaces.", "This is a governance process change for repository organization.", ["interface", "account"]),
  ]);

  const validated = validateThemeGraphEdges(graph);
  const wallet = validated.find((edge) => edge.proposalId === "EIP-8000" && edge.themeId === "wallet");

  assert.ok(!wallet || wallet.strength === "weak" || wallet.strength === "rejected");
  assert.ok(!wallet || wallet.penalties.includes("generic keyword-only match"));
});

test("clusters wallet authorization proposals without merging repository governance", () => {
  const records = [
    proposal("EIP-7702", "Set EOA account code", "Delegated authorization for wallet account abstraction.", "Smart account migration and scoped permission for wallets.", ["delegation"]),
    proposal("ERC-9001", "Session key permissions", "Session key delegation for smart account wallet UX.", "Delegated authorization with expiry and limited permissions.", ["session key"]),
    proposal("EIP-8000", "Repository interface split", "Splits ERC and EIP repositories.", "Governance and repository process only.", ["interface"]),
  ];
  const layer = buildTopicClusterLayer({ themeGraph: buildThemeGraph(records), changes: [change("EIP-7702", "status_change"), change("ERC-9001", "content_hash_change")] });
  const topic = layer.clusters.find((cluster) => cluster.id === "wallet-authorization-evolution");

  assert.ok(topic);
  assert.equal(topic.displayName, "Wallet Authorization Evolution");
  assert.ok(topic.proposalIds.includes("EIP-7702"));
  assert.ok(topic.proposalIds.includes("ERC-9001"));
  assert.ok(!topic.proposalIds.includes("EIP-8000"));
  assert.ok(getUnclusteredProposals(layer).includes("EIP-8000"));
});

test("vault request proposal avoids unrelated strong wallet, EVM, and identity membership", () => {
  const record = proposal("ERC-8161", "Transferable Tokenized Vault Requests", "ERC-4626 vault request redemption and settlement flow.", "Defines tokenized vault request standardization.", ["vault request", "redemption"]);
  const layer = buildTopicClusterLayer({ themeGraph: buildThemeGraph([record]), changes: [change("ERC-8161", "new_proposal")] });
  const memberships = layer.memberships.filter((membership) => membership.proposalId === "ERC-8161");

  assert.ok(memberships.some((membership) => membership.topicId === "vault-request-standardization" && membership.role === "anchor"));
  assert.ok(!memberships.some((membership) => membership.topicId === "wallet-authorization-evolution" && (membership.role === "anchor" || membership.role === "supporting")));
  assert.ok(!memberships.some((membership) => membership.topicId === "block-access-partial-statefulness" && (membership.role === "anchor" || membership.role === "supporting")));
});

test("AI authenticated wallet requires explicit evidence before RWA or DeFi membership", () => {
  const record = proposal("ERC-8196", "AI Agent Authenticated Wallet", "AI agent wallet authentication with passkey and delegated authorization.", "Smart account wallet policy for agentic actions.", ["ai agent", "wallet"]);
  const layer = buildTopicClusterLayer({ themeGraph: buildThemeGraph([record]), changes: [change("ERC-8196", "status_change")] });
  const topicIds = layer.memberships.filter((membership) => membership.proposalId === "ERC-8196" && membership.role !== "excluded").map((membership) => membership.topicId);

  assert.ok(topicIds.includes("wallet-authorization-evolution"));
  assert.ok(!topicIds.includes("asset-attestation-registry-standards"));
  assert.ok(!topicIds.includes("vault-request-standardization"));
});

test("asset anchor and compliance records form compliance topics, not wallet authorization", () => {
  const records = [
    proposal("ERC-8325", "Asset Anchor Registry", "Asset anchor registry for RWA attestations.", "Registry links asset facts and attestation records.", ["asset anchor"]),
    proposal("ERC-8328", "Subject-Linked Compliance Event Log", "Compliance event log for subject-linked records.", "Restricted transfer and compliance record infrastructure.", ["compliance event"]),
    proposal("ERC-8330", "Subject-Linked NAV Snapshot Oracle", "NAV snapshot oracle for asset valuation.", "Subject-linked valuation snapshot for RWA.", ["oracle"]),
  ];
  const layer = buildTopicClusterLayer({ themeGraph: buildThemeGraph(records), changes: records.map((record) => change(record.proposalId, "new_proposal")) });

  assert.ok(layer.clusters.some((cluster) => cluster.id === "programmable-compliance-infrastructure"));
  assert.ok(layer.clusters.some((cluster) => cluster.id === "asset-attestation-registry-standards"));
  assert.ok(!layer.clusters.find((cluster) => cluster.id === "wallet-authorization-evolution")?.proposalIds.some((id) => id.startsWith("ERC-832")));
});

test("reported false positives are rejected by validated theme edges", () => {
  const records = [
    proposal("EIP-7329", "ERC/EIP Repository split", "Split ERC and EIP repositories for editorial workflow.", "Repository governance and proposal process organization.", ["repository split"]),
    proposal("ERC-8161", "Transferable Tokenized Vault Requests", "ERC-4626 transferable tokenized vault request redemption flow.", "Vault request settlement standardization.", ["vault request", "redemption"]),
    proposal("ERC-8325", "Asset Anchor Registry", "Asset anchor registry for RWA attestations.", "Registry links off-chain asset facts and attestation records.", ["asset anchor", "asset registry"]),
    proposal("EIP-7864", "Ethereum state using a unified binary tree", "Unified binary tree state representation.", "Storage, state tree, statelessness, and execution client state access.", ["unified binary tree", "state tree"]),
    proposal("EIP-7904", "Compute Gas Cost Analysis", "Gas cost analysis for EVM computation.", "Gas repricing and resource accounting for EVM execution.", ["gas cost"]),
    proposal("ERC-8330", "Subject-Linked NAV Snapshot Oracle", "NAV snapshot oracle for RWA valuation.", "Subject-linked net asset value and asset valuation oracle records.", ["nav snapshot", "oracle"]),
  ];
  const layer = buildTopicClusterLayer({ themeGraph: buildThemeGraph(records), changes: records.map((record) => change(record.proposalId, "new_proposal")) });

  assertEdge(layer, "EIP-7329", "repository-governance", ["strong", "supporting"]);
  assertEdgeNotStrong(layer, "EIP-7329", "wallet");
  assert.ok(!layer.memberships.some((membership) => membership.proposalId === "EIP-7329" && membership.topicId === "wallet-authorization-evolution" && membership.role !== "adjacent"));

  assertEdge(layer, "ERC-8161", "vault", ["strong", "supporting"]);
  assertEdgeNotStrong(layer, "ERC-8161", "evm");
  assert.ok(layer.memberships.some((membership) => membership.proposalId === "ERC-8161" && membership.topicId === "vault-request-standardization" && membership.role === "anchor"));

  assertEdge(layer, "ERC-8325", "asset-attestation", ["strong", "supporting"]);
  assert.ok(!layer.memberships.some((membership) => membership.proposalId === "ERC-8325" && membership.topicId === "wallet-authorization-evolution" && membership.role !== "adjacent"));

  assertEdge(layer, "EIP-7864", "storage", ["strong", "supporting"]);
  assertEdge(layer, "EIP-7864", "statelessness", ["strong", "supporting"]);
  assert.ok(!layer.memberships.some((membership) => membership.proposalId === "EIP-7864" && membership.topicId === "vault-request-standardization" && membership.role !== "adjacent"));

  assertEdge(layer, "EIP-7904", "gas", ["strong", "supporting"]);
  assertEdge(layer, "EIP-7904", "evm", ["strong", "supporting"]);
  assert.ok(!layer.memberships.some((membership) => membership.proposalId === "EIP-7904" && membership.topicId === "wallet-authorization-evolution" && membership.role !== "adjacent"));

  assertEdge(layer, "ERC-8330", "oracle", ["strong", "supporting"]);
  assertEdge(layer, "ERC-8330", "nav", ["strong", "supporting"]);
  assert.ok(!layer.memberships.some((membership) => membership.proposalId === "ERC-8330" && membership.topicId === "post-quantum-validator-authentication" && membership.role !== "adjacent"));
});

test("Phase 12-C golden dataset assigns one conservative primary theme per proposal", () => {
  const records = [
    proposal("EIP-7329", "ERC/EIP Repository split", "Split ERC and EIP repositories for editorial workflow.", "Repository governance and proposal process organization.", ["repository split"]),
    proposal("ERC-1450", "RTA-Controlled Security Token", "Restricted transfer agent controlled security token.", "Compliance and restricted transfer controls for token standards.", ["restricted transfer"]),
    proposal("ERC-8161", "Transferable Tokenized Vault Requests", "ERC-4626 transferable tokenized vault request redemption flow.", "Vault request settlement standardization.", ["vault request", "redemption"]),
    proposal("ERC-8196", "AI Agent Authenticated Wallet", "AI agent wallet authentication with passkey and delegated authorization.", "Smart account wallet policy for agentic actions.", ["ai agent", "wallet"]),
    proposal("ERC-8328", "Subject-Linked Compliance Event Log", "Compliance event log for subject-linked records.", "Restricted transfer and compliance record infrastructure.", ["compliance event"]),
    proposal("ERC-8330", "Subject-Linked NAV Snapshot Oracle", "NAV snapshot oracle for RWA valuation.", "Subject-linked net asset value and asset valuation oracle records.", ["nav snapshot", "oracle"]),
    proposal("EIP-7708", "Native Account Abstraction Transaction", "Wallet authorization and transaction sponsorship.", "Account abstraction transaction model for wallets.", ["account abstraction"]),
    proposal("EIP-7928", "Block-Level Access Lists", "Block access list for partial statefulness.", "Execution clients can use BAL state access metadata.", ["block access list"]),
    proposal("EIP-7773", "Glamsterdam Meta EIP", "Network upgrade meta EIP.", "Defines included proposals and upgrade scope.", ["hardfork"]),
    proposal("EIP-8222", "Execution Layer Triggerable Withdrawals", "Validator withdrawal operation scheduling.", "Validator operations and execution-layer trigger.", ["validator"]),
  ];
  const layer = buildTopicClusterLayer({ themeGraph: buildThemeGraph(records), changes: records.map((record) => change(record.proposalId, "new_proposal")) });
  const assignments = new Map(getProposalThemeAssignments(layer).map((item) => [item.proposalId, item]));

  for (const record of records) {
    assert.ok(assignments.get(record.proposalId)?.primaryTheme);
    assert.equal(typeof assignments.get(record.proposalId)?.primaryTheme, "string");
  }
  assert.equal(assignments.get("EIP-7329")?.primaryTheme, "repository-governance");
  assert.notEqual(assignments.get("EIP-7329")?.primaryTheme, "wallet");
  assert.notEqual(assignments.get("ERC-1450")?.primaryTheme, "wallet");
  assert.equal(assignments.get("ERC-8161")?.primaryTheme, "vault");
  assert.ok(["account-abstraction", "wallet"].includes(assignments.get("ERC-8196")?.primaryTheme ?? ""));
  assert.ok(["nav", "oracle"].includes(assignments.get("ERC-8330")?.primaryTheme ?? ""));
  assert.ok(["storage", "statelessness", "execution-layer"].includes(assignments.get("EIP-7928")?.primaryTheme ?? ""));
});

test("block access lists form a separate partial-statefulness topic", () => {
  const records = [
    proposal("EIP-7928", "Block-Level Access Lists", "Block access list for partial statefulness.", "Execution clients can use BAL state access metadata.", ["block access list"]),
    proposal("EIP-8007", "Partial statefulness mode", "Partial statefulness execution constraints.", "State access and client testing for block access lists.", ["partial statefulness"]),
  ];
  const adoptionLayer: AdoptionLayer = {
    generatedBy: "github_search",
    collectionStatus: "collected",
    items: [
      {
        proposalId: "EIP-7928",
        title: "Block-Level Access Lists",
        theme: "Execution",
        evidenceLevel: "Implementation",
        evidenceScore: 55,
        sources: [{ sourceType: "github_pr", semanticType: "client_implementation_pr", title: "go-ethereum BAL PR", updatedAt: "2026-07-24T00:00:00.000Z" }],
        summary: "implementation evidence collected",
        caution: "release evidence still required",
      },
    ],
  };
  const layer = buildTopicClusterLayer({ themeGraph: buildThemeGraph(records), changes: [change("EIP-7928", "content_hash_change")], adoptionLayer });
  const topic = layer.clusters.find((cluster) => cluster.id === "block-access-partial-statefulness");

  assert.ok(topic);
  assert.ok(topic.proposalIds.includes("EIP-7928"));
  assert.ok(topic.activityProfile.implementationEvidenceCount >= 1);
  assert.ok(!topic.themeIds.includes("wallet"));
});

test("calculates cohesion, roles, traceability, gaps, and deterministic ordering", () => {
  const records = [
    proposal("EIP-7702", "Set EOA account code", "Delegated authorization for wallet account abstraction.", "Smart account migration and scoped permission.", ["delegated authorization"]),
    proposal("ERC-9001", "Session key permissions", "Session key delegation for smart account wallet UX.", "Delegated authorization with expiry.", ["session key"]),
    proposal("ERC-9002", "Passkey smart account", "WebAuthn passkey smart account authentication.", "P-256 validation for wallets.", ["passkey"]),
  ];
  const layer = buildTopicClusterLayer({ themeGraph: buildThemeGraph(records), changes: records.map((record) => change(record.proposalId, "new_proposal")) });
  const topic = getTopicForProposal(layer, "EIP-7702");

  assert.equal(topic?.id, "wallet-authorization-evolution");
  assert.ok(getTopicCohesion(layer, "wallet-authorization-evolution") >= 50);
  assert.ok(topic?.traceability.membershipIds.length);
  assert.ok(topic?.traceability.scoreBreakdown.some((item) => item.label === "strong theme overlap"));
  assert.ok(topic?.gaps.some((gap) => gap.type === "implementation_missing"));
  assert.deepEqual(getDominantTopics(layer).map((item) => item.id), getDominantTopics(layer).map((item) => item.id));
});

test("limits published memberships and marks weaker memberships adjacent", () => {
  const record = proposal("ERC-9500", "AI Agent Wallet Paymaster Compliance Bridge", "AI agent wallet with paymaster, compliance, bridge and settlement hooks.", "Smart account session key authorization plus asset attestation and cross-chain payment support.", ["ai agent", "paymaster", "compliance", "bridge", "settlement"]);
  const layer = buildTopicClusterLayer({ themeGraph: buildThemeGraph([record]), changes: [change("ERC-9500", "new_proposal")] });
  const published = layer.memberships.filter((membership) => membership.proposalId === "ERC-9500" && (membership.role === "anchor" || membership.role === "supporting"));

  assert.ok(published.length <= 3);
  assert.ok(layer.memberships.some((membership) => membership.proposalId === "ERC-9500" && membership.role === "adjacent"));
});

test("classifies emerging topics cautiously when collection is degraded", () => {
  const records = [
    proposal("EIP-7702", "Set EOA account code", "Delegated authorization for wallet account abstraction.", "Smart account migration.", ["delegation"]),
    proposal("ERC-9001", "Session key permissions", "Session key delegation.", "Wallet permissions.", ["session key"]),
  ];
  const layer = buildTopicClusterLayer({ themeGraph: buildThemeGraph(records), changes: records.map((record) => change(record.proposalId, "new_proposal")), collectionCompleteness: 20 });

  assert.ok(layer.clusters.every((cluster) => cluster.state === "insufficient evidence"));
  assert.ok(layer.clusters.every((cluster) => cluster.limitations.some((limit) => /degraded/i.test(limit))));
});

test("topic API supports theme lookup, evidence lookup, and emerging topic lookup", () => {
  const records = [
    proposal("ERC-8325", "Asset Anchor Registry", "Asset anchor registry for RWA attestations.", "Registry links asset facts.", ["asset anchor"]),
    proposal("ERC-8328", "Subject-Linked Compliance Event Log", "Compliance event log.", "Restricted transfer record.", ["compliance event"]),
  ];
  const layer = buildTopicClusterLayer({ themeGraph: buildThemeGraph(records), changes: records.map((record) => change(record.proposalId, "new_proposal")) });

  assert.ok(getTopicsForTheme(layer, "compliance").length >= 1);
  assert.ok(getTopicEvidence(layer, "programmable-compliance-infrastructure").length >= 1);
  assert.ok(getEmergingTopics(layer).some((topic) => topic.id === "programmable-compliance-infrastructure"));
});

test("topic diagnostics expose validation and publication invariants", () => {
  const records = [
    proposal("EIP-7702", "Set EOA account code", "Delegated authorization for wallet account abstraction.", "Smart account migration.", ["delegated authorization"]),
    proposal("ERC-9001", "Session key permissions", "Session key delegation.", "Wallet permissions.", ["session key"]),
  ];
  const layer = buildTopicClusterLayer({ themeGraph: buildThemeGraph(records), changes: records.map((record) => change(record.proposalId, "new_proposal")) });

  assert.equal(layer.calculationVersion, "phase7b-topic-cluster-2");
  assert.equal(layer.ruleVersion, "phase7b-validation-2");
  assert.equal(layer.diagnostics.oldThemeStoryPathUsageCount, 0);
  assert.equal(layer.diagnostics.publishedUnclassifiedTopicCount, 0);
  assert.deepEqual(layer.diagnostics.proposalsWithMoreThan3TopicMemberships, []);
  assert.deepEqual(layer.diagnostics.topicsWithMoreThan10AnchorSupportingProposals, []);
  assert.ok(layer.validatedEdges.every((edge) => typeof edge.rawConfidence === "number" && typeof edge.validatedConfidence === "number" && Array.isArray(edge.positiveEvidence)));
});

function proposal(proposalId: string, title: string, description: string, bodyExcerpt: string, keywords: string[] = []): ProposalRecord {
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

function assertEdge(layer: ReturnType<typeof buildTopicClusterLayer>, proposalId: string, themeId: string, strengths: Array<"strong" | "supporting" | "weak" | "rejected">): void {
  const edge = layer.validatedEdges.find((item) => item.proposalId === proposalId && item.themeId === themeId);
  assert.ok(edge, `${proposalId} should have ${themeId} edge`);
  assert.ok(strengths.includes(edge.strength), `${proposalId}/${themeId} strength was ${edge.strength}`);
}

function assertEdgeNotStrong(layer: ReturnType<typeof buildTopicClusterLayer>, proposalId: string, themeId: string): void {
  const edge = layer.validatedEdges.find((item) => item.proposalId === proposalId && item.themeId === themeId);
  assert.ok(!edge || edge.strength === "weak" || edge.strength === "rejected", `${proposalId}/${themeId} should not be strong or supporting`);
}
