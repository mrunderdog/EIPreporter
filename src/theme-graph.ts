import type { ProposalRecord } from "./types.ts";

export type ThemeDefinition = {
  id: string;
  displayName: string;
  description: string;
  keywords: string[];
  aliases: string[];
};

export type ThemeEvidenceMatch = {
  term: string;
  field: "proposalId" | "title" | "description" | "bodyExcerpt" | "proposalType" | "category" | "keywords";
  excerpt: string;
};

export type ProposalThemeEdge = {
  proposalId: string;
  themeId: string;
  displayName: string;
  confidence: number;
  matchedEvidence: ThemeEvidenceMatch[];
};

export type ThemeGraph = {
  generatedBy: "deterministic_theme_graph";
  themes: ThemeDefinition[];
  proposals: ProposalRecord[];
  edges: ProposalThemeEdge[];
};

export type ThemeCoverage = {
  themeId: string;
  displayName: string;
  proposalCount: number;
  averageConfidence: number;
  evidenceCount: number;
};

export const THEME_DEFINITIONS: ThemeDefinition[] = [
  theme("wallet", "Wallet", "Wallet behavior, signing surfaces, account UX, and user-facing authorization.", ["wallet", "signer", "signature", "authorization", "account recovery", "social recovery"], ["wallet ux", "wallets"]),
  theme("account-abstraction", "Account Abstraction", "Account abstraction standards, infrastructure, and account programmability.", ["account abstraction", "erc-4337", "useroperation", "user operation", "entrypoint", "bundler", "paymaster"], ["aa", "erc4337"]),
  theme("identity", "Identity", "Identity, credentials, subject binding, and verifiable claims.", ["identity", "credential", "verifiable credential", "claim", "subject", "kyc"], ["credentials"]),
  theme("delegation", "Delegation", "Delegated authority, scoped permissions, and authority transfer.", ["delegation", "delegate", "delegated", "authorization", "permission", "authority"], ["scoped permission"]),
  theme("smart-account", "Smart Account", "Contract accounts, programmable validation, and modular account systems.", ["smart account", "contract account", "modular account", "erc-7579", "erc-6900", "account module"], ["smart wallet"]),
  theme("session-key", "Session Key", "Session keys and temporary or scoped signing authority.", ["session key", "session keys", "time-bound", "expiry", "scoped permission"], ["session permission"]),
  theme("passkey", "Passkey", "Passkeys, WebAuthn, device-bound authentication, and P-256 signing.", ["passkey", "webauthn", "p-256", "secp256r1", "authenticator"], ["web authentication"]),
  theme("security", "Security", "Security properties, validation, replay protection, and risk controls.", ["security", "replay protection", "validation", "authentication", "attack", "risk"], ["protocol security"]),
  theme("cryptography", "Cryptography", "Cryptographic primitives, signatures, hashes, proofs, and curves.", ["cryptography", "signature", "hash", "kzg", "bls", "secp256k1", "secp256r1", "proof"], ["crypto primitives"]),
  theme("execution-layer", "Execution Layer", "Execution-layer semantics, transaction processing, and state transition behavior.", ["execution layer", "execution", "state transition", "transaction", "evm", "block access list", "partial statefulness"], ["el"]),
  theme("evm", "EVM", "EVM instructions, opcodes, precompiles, and virtual machine behavior.", ["evm", "opcode", "opcodes", "precompile", "instruction"], ["ethereum virtual machine"]),
  theme("gas", "Gas", "Gas metering, pricing, accounting, refunds, and fee mechanics.", ["gas", "gas cost", "gas pricing", "gas accounting", "refund", "fee"], ["fees"]),
  theme("eof", "EOF", "Ethereum Object Format and contract code container changes.", ["eof", "ethereum object format", "code section", "container"], ["object format"]),
  theme("l2", "L2", "Layer 2 protocols, rollups, sequencers, and L1-L2 coordination.", ["l2", "layer 2", "layer2", "rollup", "sequencer"], ["layer two"]),
  theme("rollup", "Rollup", "Rollup execution, proofs, sequencing, and settlement paths.", ["rollup", "zk-rollup", "optimistic", "fraud proof", "validity proof"], ["rollups"]),
  theme("bridge", "Bridge", "Bridge messaging, cross-chain transfer, and asset movement.", ["bridge", "bridging", "message passing", "cross-chain message"], ["bridges"]),
  theme("interoperability", "Interoperability", "Cross-domain interoperability and compatible interfaces between systems.", ["interoperability", "interoperable", "cross-chain", "cross chain", "canonical asset"], ["interop"]),
  theme("privacy", "Privacy", "Private transfers, confidential data, and disclosure minimization.", ["privacy", "private", "confidential", "shielded", "selective disclosure"], ["confidentiality"]),
  theme("zero-knowledge", "Zero Knowledge", "Zero-knowledge proofs and privacy or validity proof systems.", ["zero knowledge", "zero-knowledge", "zk", "zkp", "validity proof"], ["zk"]),
  theme("rwa", "RWA", "Real-world asset representation, attestations, reserves, and off-chain asset linkage.", ["rwa", "real world asset", "real-world asset", "proof of reserve", "attestation", "asset-backed"], ["real world assets"]),
  theme("asset-attestation", "Asset Attestation", "Asset anchors, registries, and attestations for off-chain asset facts.", ["asset anchor", "asset registry", "asset attestation", "attestation registry", "proof of reserve"], ["asset registry"]),
  theme("nav", "NAV", "Net asset value snapshots, valuation records, and asset pricing reference data.", ["nav", "nav snapshot", "net asset value", "valuation snapshot", "asset valuation"], ["net asset value"]),
  theme("tokenization", "Tokenization", "Token standards, tokenized claims, vaults, and asset representation.", ["token", "tokenized", "erc-20", "erc-721", "erc-1155", "erc-4626"], ["token standard"]),
  theme("vault", "Vault", "Vault standards, tokenized vault requests, deposits, redemption, and share lifecycle flows.", ["vault", "vault request", "tokenized vault", "erc-4626", "redemption request"], ["vaults"]),
  theme("compliance", "Compliance", "Compliance, allowlists, sanctions, restricted transfer, and regulated access.", ["compliance", "allowlist", "whitelist", "restricted transfer", "sanction", "kyc"], ["restricted transfer"]),
  theme("stablecoin", "Stablecoin", "Stablecoin issuance, redemption, settlement, and payment flows.", ["stablecoin", "stable coin", "mint", "burn", "redemption", "issuer"], ["stablecoins"]),
  theme("institutional", "Institutional", "Institutional operations, regulated markets, and enterprise adoption surfaces.", ["institutional", "enterprise", "regulated", "custody", "settlement", "compliance"], ["enterprise"]),
  theme("custody", "Custody", "Custody operations, approval policy, multisig, and key control.", ["custody", "custodian", "multisig", "key management", "approval policy"], ["custodial"]),
  theme("settlement", "Settlement", "Settlement, clearing, redemption, and post-trade operational flows.", ["settlement", "clearing", "redemption", "redeem", "payment finality"], ["post trade"]),
  theme("governance", "Governance", "Governance processes, proposal lifecycle, voting, and network upgrade coordination.", ["governance", "voting", "vote", "proposal process", "eip process", "hardfork", "fork"], ["process"]),
  theme("repository-governance", "Repository Governance", "EIP/ERC repository process, split, organization, and editorial workflow changes.", ["repository split", "repository governance", "eip repository", "erc repository", "editorial workflow", "proposal repository"], ["repo governance"]),
  theme("developer-experience", "Developer Experience", "Developer ergonomics, APIs, standards usability, and integration complexity.", ["developer experience", "user experience", "developer", "ergonomics", "api", "sdk", "interface", "ux"], ["dx"]),
  theme("tooling", "Tooling", "Testing, SDKs, tooling, framework, and developer infrastructure.", ["tooling", "tool", "sdk", "framework", "test", "tests", "debug"], ["developer tooling"]),
  theme("infrastructure", "Infrastructure", "Infrastructure, nodes, RPC, indexing, bundlers, and operational services.", ["infrastructure", "node", "rpc", "indexer", "bundler", "relayer"], ["infra"]),
  theme("testing", "Testing", "Specification tests, conformance, fixtures, and validation suites.", ["testing", "test", "tests", "fixture", "conformance", "coverage"], ["spec tests"]),
  theme("performance", "Performance", "Performance, throughput, latency, resource use, and optimization.", ["performance", "throughput", "latency", "optimization", "efficiency"], ["perf"]),
  theme("storage", "Storage", "Storage, state, history, trie, database, and persistence behavior.", ["storage", "state", "state access", "partial statefulness", "block access list", "history", "trie", "database", "persistence", "binary tree", "state tree", "unified binary tree"], ["state storage"]),
  theme("statelessness", "Statelessness", "Statelessness, partial state, state witness, and state tree representation.", ["statelessness", "partial statefulness", "state witness", "state tree", "binary tree", "unified binary tree", "verkle"], ["statefulness"]),
  theme("networking", "Networking", "P2P networking, discovery, messages, and wire protocols.", ["networking", "p2p", "peer", "discovery", "gossip", "wire protocol"], ["network"]),
  theme("client", "Client", "Execution or consensus client implementation and interoperability.", ["client", "execution client", "consensus client", "go-ethereum", "geth", "nethermind", "besu", "erigon", "lighthouse", "prysm", "teku", "nimbus"], ["ethereum client"]),
  theme("consensus", "Consensus", "Consensus protocol, validators, fork choice, finality, and beacon-chain behavior.", ["consensus", "beacon", "fork choice", "finality", "validator"], ["consensus layer"]),
  theme("staking", "Staking", "Staking, validator deposits, withdrawal credentials, and validator operations.", ["staking", "stake", "validator", "withdrawal credential", "deposit"], ["validators"]),
  theme("mev", "MEV", "MEV, block building, proposer-builder separation, and ordering markets.", ["mev", "pbs", "block builder", "proposer", "builder", "order flow"], ["maximal extractable value"]),
  theme("oracle", "Oracle", "Oracle data, price feeds, valuation, and external data interfaces.", ["oracle", "price feed", "pricing", "valuation", "twap"], ["pricing oracle"]),
  theme("intent", "Intent", "Intent-based execution, solvers, and outcome-oriented transaction flow.", ["intent", "intents", "solver", "solvers", "intent-based"], ["solver"]),
  theme("ai-agent", "AI Agent", "AI-agent wallets, delegated agent actions, tool registries, and autonomous execution.", ["ai agent", "agent", "agentic", "tool registry", "autonomous"], ["agent wallet"]),
  theme("payments", "Payments", "Payments, transaction sponsorship, settlement, and user payment flows.", ["payment", "payments", "paymaster", "sponsor", "settlement", "stablecoin"], ["pay"]),
];

const FIELD_WEIGHTS: Record<ThemeEvidenceMatch["field"], number> = {
  proposalId: 0.2,
  title: 0.34,
  description: 0.26,
  bodyExcerpt: 0.22,
  proposalType: 0.08,
  category: 0.08,
  keywords: 0.18,
};

export function buildThemeGraph(proposals: ProposalRecord[], themes = THEME_DEFINITIONS): ThemeGraph {
  return {
    generatedBy: "deterministic_theme_graph",
    themes,
    proposals,
    edges: proposals.flatMap((proposal) => mapProposalToThemes(proposal, themes)),
  };
}

export function getThemesForProposal(graph: ThemeGraph, proposalId: string): ProposalThemeEdge[] {
  return graph.edges
    .filter((edge) => edge.proposalId === proposalId)
    .sort(compareEdges);
}

export function getProposalsForTheme(graph: ThemeGraph, themeId: string): ProposalThemeEdge[] {
  return graph.edges
    .filter((edge) => edge.themeId === themeId)
    .sort(compareEdges);
}

export function getThemeCoverage(graph: ThemeGraph): ThemeCoverage[] {
  return graph.themes.map((themeDef) => {
    const edges = getProposalsForTheme(graph, themeDef.id);
    return {
      themeId: themeDef.id,
      displayName: themeDef.displayName,
      proposalCount: edges.length,
      averageConfidence: edges.length ? roundConfidence(edges.reduce((sum, edge) => sum + edge.confidence, 0) / edges.length) : 0,
      evidenceCount: edges.reduce((sum, edge) => sum + edge.matchedEvidence.length, 0),
    };
  }).sort((left, right) =>
    right.proposalCount - left.proposalCount
    || right.averageConfidence - left.averageConfidence
    || left.displayName.localeCompare(right.displayName)
  );
}

export function getDominantThemes(graph: ThemeGraph, limit = 8): ThemeCoverage[] {
  return getThemeCoverage(graph)
    .filter((item) => item.proposalCount > 0)
    .slice(0, limit);
}

function mapProposalToThemes(proposal: ProposalRecord, themes: ThemeDefinition[]): ProposalThemeEdge[] {
  return themes
    .map((themeDef) => {
      const matchedEvidence = findMatches(proposal, themeDef);
      if (!matchedEvidence.length) return null;
      return {
        proposalId: proposal.proposalId,
        themeId: themeDef.id,
        displayName: themeDef.displayName,
        confidence: confidenceForMatches(matchedEvidence),
        matchedEvidence,
      };
    })
    .filter((edge): edge is ProposalThemeEdge => edge !== null)
    .sort(compareEdges);
}

function findMatches(proposal: ProposalRecord, themeDef: ThemeDefinition): ThemeEvidenceMatch[] {
  const terms = uniqueTerms([...themeDef.keywords, ...themeDef.aliases]);
  const fields = proposalFields(proposal);
  const matches: ThemeEvidenceMatch[] = [];
  for (const [field, value] of fields) {
    const normalized = normalize(value);
    if (!normalized) continue;
    for (const term of terms) {
      const normalizedTerm = normalize(term);
      if (normalizedTerm && termMatches(normalized, normalizedTerm)) {
        matches.push({ term, field, excerpt: excerptFor(value, term) });
      }
    }
  }
  return dedupeMatches(matches);
}

function confidenceForMatches(matches: ThemeEvidenceMatch[]): number {
  const fieldScore = new Set(matches.map((match) => match.field));
  const weighted = [...fieldScore].reduce((sum, field) => sum + FIELD_WEIGHTS[field], 0);
  const termDiversity = Math.min(0.28, new Set(matches.map((match) => normalize(match.term))).size * 0.07);
  const evidenceVolume = Math.min(0.16, matches.length * 0.04);
  return roundConfidence(Math.min(0.99, weighted + termDiversity + evidenceVolume));
}

function proposalFields(proposal: ProposalRecord): Array<[ThemeEvidenceMatch["field"], string]> {
  return [
    ["proposalId", proposal.proposalId],
    ["title", proposal.title ?? ""],
    ["description", proposal.description ?? ""],
    ["bodyExcerpt", proposal.bodyExcerpt ?? ""],
    ["proposalType", proposal.proposalType ?? ""],
    ["category", proposal.category ?? ""],
    ["keywords", (proposal.keywords ?? []).join(" ")],
  ];
}

function theme(id: string, displayName: string, description: string, keywords: string[], aliases: string[]): ThemeDefinition {
  return { id, displayName, description, keywords, aliases };
}

function uniqueTerms(terms: string[]): string[] {
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
}

function dedupeMatches(matches: ThemeEvidenceMatch[]): ThemeEvidenceMatch[] {
  const seen = new Set<string>();
  const result: ThemeEvidenceMatch[] = [];
  for (const match of matches) {
    const key = `${match.field}:${normalize(match.term)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(match);
  }
  return result;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

function termMatches(value: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(value);
}

function excerptFor(value: string, term: string): string {
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  const index = normalize(normalizedValue).indexOf(normalize(term));
  if (index < 0) return normalizedValue.slice(0, 120);
  const start = Math.max(0, index - 40);
  const end = Math.min(normalizedValue.length, index + term.length + 60);
  return normalizedValue.slice(start, end);
}

function compareEdges(left: ProposalThemeEdge, right: ProposalThemeEdge): number {
  return right.confidence - left.confidence
    || right.matchedEvidence.length - left.matchedEvidence.length
    || left.displayName.localeCompare(right.displayName);
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}
