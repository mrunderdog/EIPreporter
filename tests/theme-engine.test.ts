import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeProposal,
  buildAccountAbstractionRadar,
  buildThemeInsights,
} from "../src/theme-engine.ts";
import type { ProposalRecord } from "../src/types.ts";

test("classifies themes from title, description, body, category, and keywords", () => {
  const analysis = analyzeProposal(makeRecord(
    "ERC-9000",
    "Modular smart account with passkey",
    "A WebAuthn account abstraction proposal",
    "Supports ERC-7579 modules and signature validation.",
  ));

  assert.ok(analysis.themes.includes("Account Abstraction"));
  assert.ok(analysis.themes.includes("Smart Account"));
  assert.ok(analysis.themes.includes("Passkey / WebAuthn"));
  assert.ok(analysis.themes.includes("Signature / Security"));
});

test("extracts dominant sub-trends and builds the Account Abstraction Radar", () => {
  const analyses = [
    analyzeProposal(makeRecord("ERC-7579", "Modular smart account", "ERC-7579 account module", "paymaster and session key")),
    analyzeProposal(makeRecord("ERC-4337", "Account abstraction", "user operation bundler", "paymaster infrastructure")),
  ];
  const insights = buildThemeInsights(analyses, []);
  const aa = insights.find((item) => item.theme === "Account Abstraction");
  const radar = buildAccountAbstractionRadar(analyses);

  assert.equal(aa?.proposalCount, 2);
  assert.ok(aa?.dominantSubTrends.some((item) => item.name === "Paymaster / gas sponsorship"));
  assert.equal(radar.proposalCount, 2);
  assert.equal(radar.subTrendDistribution["Paymaster / gas sponsorship"], 2);
  assert.match(radar.kgldWalletUxInterpretation, /KGLD/);
});

test("classifies common unclassified proposal themes deterministically", () => {
  assert.ok(analyzeProposal(makeRecord("EIP-9103", "Meta hardfork BPO network upgrade", "fork governance", "")).themes.includes("Network Upgrade / Governance"));
  assert.ok(analyzeProposal(makeRecord("EIP-9104", "Block access list exchange", "validator block operations", "")).themes.includes("Block / Validator Operations"));
  assert.ok(analyzeProposal(makeRecord("EIP-9105", "KZG precompile opcode extension", "EVM gas", "")).themes.includes("EVM / Gas / Opcode"));
  assert.ok(analyzeProposal(makeRecord("EIP-9106", "Block-in-blobs BIB", "blob data availability", "")).themes.includes("Data Availability"));
  assert.ok(analyzeProposal(makeRecord("ERC-9107", "Authority credential binding recovery", "identity credential", "")).themes.includes("Identity / Credential"));
  assert.ok(analyzeProposal(makeRecord("ERC-9108", "Authenticated wallet account", "smart wallet", "")).themes.includes("Wallet UX"));
});

test("classifies EIP-8141 Frame Transaction as transaction model execution", () => {
  const analysis = analyzeProposal(makeRecord(
    "EIP-8141",
    "Frame Transaction",
    "Defines a transaction frame for execution.",
    "The proposal clarifies transaction structure and execution frame boundaries.",
  ));

  assert.ok(analysis.themes.includes("Transaction Model / Execution"));
  assert.ok(analysis.subTrendsByTheme["Transaction Model / Execution"]?.includes("Transaction framing"));
});

test("does not classify unrelated token transfers as transaction model execution", () => {
  const analysis = analyzeProposal(makeRecord(
    "ERC-9200",
    "Restricted token transfer",
    "Adds transfer restrictions for token movement.",
    "The proposal defines allowlist checks for ERC-20 transfers.",
  ));

  assert.ok(!analysis.themes.includes("Transaction Model / Execution"));
});

test("extracts RWA, DeFi, and cross-chain implementation approaches", () => {
  const rwa = analyzeProposal(makeRecord("ERC-9100", "RWA proof of reserve", "credential compliance proof", "custody and redemption proof"));
  const defi = analyzeProposal(makeRecord("ERC-9101", "ERC-4626 vault extension", "oracle pricing and collateral", "liquidity redemption flow"));
  const bridge = analyzeProposal(makeRecord("ERC-9102", "Cross-chain bridge messaging", "canonical asset representation", "replay protection verification"));

  assert.ok(rwa.subTrendsByTheme["RWA / Attestation"]?.includes("Proof of reserve"));
  assert.ok(defi.subTrendsByTheme["DeFi / Vault"]?.includes("ERC-4626 vault extension"));
  assert.ok(bridge.subTrendsByTheme["Cross-chain / Bridge"]?.includes("Replay protection"));
});

function makeRecord(
  proposalId: string,
  title: string,
  description: string,
  bodyExcerpt: string,
): ProposalRecord {
  const number = Number(proposalId.split("-")[1]);
  return {
    proposalId,
    kind: "ERC",
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
    keywords: [],
    sourceRepo: "ethereum/ercs",
    sourcePath: `ERCS/erc-${number}.md`,
    canonicalUrl: `https://example.test/${proposalId}`,
    rawContentHash: "hash",
  };
}
