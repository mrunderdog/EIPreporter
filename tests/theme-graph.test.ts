import assert from "node:assert/strict";
import test from "node:test";
import {
  buildThemeGraph,
  getDominantThemes,
  getProposalsForTheme,
  getThemeCoverage,
  getThemesForProposal,
  THEME_DEFINITIONS,
} from "../src/theme-graph.ts";
import type { ProposalRecord } from "../src/types.ts";

test("maps one proposal to multiple semantic themes", () => {
  const graph = buildThemeGraph([
    makeRecord(
      "EIP-7702",
      "Set EOA account code with wallet delegation",
      "Delegation and authorization proposal for smart account wallet UX.",
      "This account abstraction design affects signer behavior, smart account migration, and scoped permissions.",
      ["wallet", "delegation", "account abstraction"],
    ),
  ]);

  const themeIds = getThemesForProposal(graph, "EIP-7702").map((edge) => edge.themeId);

  assert.ok(themeIds.includes("wallet"));
  assert.ok(themeIds.includes("account-abstraction"));
  assert.ok(themeIds.includes("delegation"));
  assert.ok(themeIds.includes("smart-account"));
  assert.ok(themeIds.length > 4);
});

test("generates confidence from field strength and evidence diversity", () => {
  const graph = buildThemeGraph([
    makeRecord(
      "ERC-4337",
      "Account abstraction EntryPoint",
      "UserOperation bundler and paymaster infrastructure.",
      "The proposal defines account abstraction flow for smart accounts.",
      ["erc-4337", "bundler", "paymaster"],
    ),
  ]);

  const aa = getThemesForProposal(graph, "ERC-4337").find((edge) => edge.themeId === "account-abstraction");
  const tooling = getThemesForProposal(graph, "ERC-4337").find((edge) => edge.themeId === "tooling");

  assert.ok((aa?.confidence ?? 0) >= 0.8);
  assert.ok((aa?.confidence ?? 0) > (tooling?.confidence ?? 0));
});

test("preserves matched evidence for each proposal-theme edge", () => {
  const graph = buildThemeGraph([
    makeRecord(
      "ERC-9000",
      "Passkey smart account recovery",
      "WebAuthn passkey authentication for wallet recovery.",
      "Uses P-256 validation and signature checks.",
      ["passkey"],
    ),
  ]);

  const passkey = getThemesForProposal(graph, "ERC-9000").find((edge) => edge.themeId === "passkey");

  assert.ok(passkey);
  assert.ok(passkey.matchedEvidence.some((match) => match.term === "passkey" && match.field === "title"));
  assert.ok(passkey.matchedEvidence.some((match) => match.term === "webauthn" && match.field === "description"));
  assert.ok(passkey.matchedEvidence.every((match) => match.excerpt.length > 0));
});

test("supports reverse lookup and dominant theme coverage", () => {
  const graph = buildThemeGraph([
    makeRecord("ERC-1", "Wallet delegation", "wallet authorization", "delegated signer", ["wallet"]),
    makeRecord("ERC-2", "Smart account wallet", "account abstraction wallet", "bundler paymaster", ["account abstraction"]),
    makeRecord("ERC-3", "Oracle price feed", "oracle pricing", "valuation feed", ["oracle"]),
  ]);

  const walletProposals = getProposalsForTheme(graph, "wallet").map((edge) => edge.proposalId);
  const coverage = getThemeCoverage(graph);
  const dominant = getDominantThemes(graph, 2);

  assert.ok(walletProposals.includes("ERC-1"));
  assert.ok(walletProposals.includes("ERC-2"));
  assert.equal(coverage.find((item) => item.themeId === "wallet")?.proposalCount, 2);
  assert.equal(dominant[0]?.themeId, "wallet");
  assert.equal(dominant.length, 2);
});

test("defines the required initial taxonomy without hardcoded theme edges", () => {
  const required = [
    "wallet",
    "account-abstraction",
    "identity",
    "delegation",
    "smart-account",
    "session-key",
    "passkey",
    "security",
    "cryptography",
    "execution-layer",
    "evm",
    "gas",
    "eof",
    "l2",
    "rollup",
    "bridge",
    "interoperability",
    "privacy",
    "zero-knowledge",
    "rwa",
    "tokenization",
    "compliance",
    "stablecoin",
    "institutional",
    "custody",
    "settlement",
    "governance",
    "developer-experience",
    "tooling",
    "infrastructure",
    "testing",
    "performance",
    "storage",
    "networking",
    "client",
    "consensus",
    "staking",
    "mev",
    "oracle",
    "intent",
    "ai-agent",
    "payments",
  ];
  const ids = new Set(THEME_DEFINITIONS.map((theme) => theme.id));

  for (const id of required) assert.ok(ids.has(id), `missing theme ${id}`);
  assert.ok(THEME_DEFINITIONS.every((theme) => theme.keywords.length > 0));
  assert.ok(THEME_DEFINITIONS.every((theme) => !("relatedThemes" in theme)));
});

function makeRecord(
  proposalId: string,
  title: string,
  description: string,
  bodyExcerpt: string,
  keywords: string[] = [],
): ProposalRecord {
  const number = Number(proposalId.split("-")[1]);
  return {
    proposalId,
    kind: proposalId.startsWith("ERC") ? "ERC" : "EIP",
    number,
    title,
    status: "Draft",
    proposalType: "Standards Track",
    category: "ERC",
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
