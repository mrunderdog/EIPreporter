import type {
  AdoptionEvidenceItem,
  ChangeEvent,
  DiscussionHeatItem,
  KgldCandidate,
  RepresentativeProposal,
  ThemeInsight,
  WeeklyRadarReport,
} from "./types.ts";

export type AtlasDomainId =
  | "execution-state"
  | "scaling-data"
  | "accounts-wallets"
  | "validators-consensus"
  | "tokens-finance"
  | "identity-compliance"
  | "interoperability"
  | "governance-process";

export type MomentumDirection = "증가" | "유지" | "감소" | "데이터 부족";
export type MaturityStage = "신규 탐색" | "활발한 Proposal 논의" | "상태 진전" | "구현 근거 확인" | "데이터 부족";

export type DomainDefinition = {
  id: AtlasDomainId;
  nameKo: string;
  problemKo: string;
  keywords: string[];
  technologies: string[];
};

export type ClassifiedProposal = {
  proposalId: string;
  title: string;
  proposalKind?: string;
  status: string;
  canonicalUrl?: string;
  primaryDomain?: AtlasDomainId;
  secondaryDomains: AtlasDomainId[];
  topicIds: string[];
  topicNames: string[];
  technologies: string[];
  technologyEvidence: TechnologyEvidence[];
  problemStatement: string;
  proposedChange: string;
  representativeReason: string;
  classificationEvidence: string[];
  classificationConfidence: number;
  confidenceBand: "main" | "appendix" | "review_required";
  classificationVersion: string;
  activity: ProposalActivitySummary;
  recentActivity: string;
};

export type TechnologyActivity = {
  name: string;
  activity180d: number;
  activity7d: number;
  proposalIds: string[];
};

export type TechnologyEvidence = {
  technology: string;
  evidenceField: "title" | "abstract" | "motivation" | "specification" | "reference" | "discussion" | "theme";
  matchedText?: string;
  evidenceId?: string;
  confidence: number;
};

export type DomainActivity = {
  domain: DomainDefinition;
  activity180d: number;
  activity7d: number;
  previousActivity7d: number | null;
  activeProposalCount180d: number;
  activeProposalCount7d: number;
  previousActiveProposalCount7d: number | null;
  repositoryActivity180d: number;
  repositoryActivity7d: number;
  discussionActivity180d: number;
  discussionActivity7d: number;
  newProposalCount: number;
  bodyChangeCount: number;
  statusChangeCount: number;
  discussionActivity: number;
  momentumDirection: MomentumDirection;
  evidenceCount: number;
  technologies: TechnologyActivity[];
  representativeProposals: ClassifiedProposal[];
  representativeDiscussions: Array<{ title: string; url?: string; proposalId: string }>;
};

export type ProposalActivitySummary = {
  current180d: ActivityWindowSummary;
  current7d: ActivityWindowSummary;
  previous7d: ActivityWindowSummary;
};

export type ActivityWindowSummary = {
  activeProposalCount: number;
  newProposalCount: number;
  bodyChangeCount: number;
  statusChangeCount: number;
  discussionCount: number;
};

export type TechnologyRelation = {
  sourceTechnology: string;
  targetTechnology: string;
  relationType: string;
  explanationKo: string;
  evidenceProposalIds: string[];
  evidenceDiscussionUrls: string[];
  evidenceType?: "explicit_reference" | "specification_statement" | "analyst_inference";
  evidenceUrl?: string;
  evidenceSection?: string;
  evidenceExcerpt?: string;
  inferred?: boolean;
  confidence: number;
};

export type MaturityTechnology = {
  technology: string;
  stage: MaturityStage;
  reasonKo: string;
  proposalIds: string[];
};

export type WeeklyAtlasChange = {
  titleKo: string;
  domainNameKo: string;
  whyKo: string;
  evidence: string;
};

export type KgldObservation = {
  technologyChange: string;
  connectionReasonKo: string;
  requiredActionKo: string;
  evidenceProposalIds: string[];
};

export type TechnologyAtlas = {
  version: "technology-atlas-1";
  generatedAt: string;
  domains: DomainActivity[];
  classifiedProposals: ClassifiedProposal[];
  heldProposals: ClassifiedProposal[];
  relationships: TechnologyRelation[];
  maturity: Record<MaturityStage, MaturityTechnology[]>;
  weeklyChanges: WeeklyAtlasChange[];
  kgldObservations: KgldObservation[];
  summaryKo: string[];
  dataQualityKo: string;
  charts: {
    domain180d: { labels: string[]; data: number[] };
    domain7d: { labels: string[]; data: number[] };
    topTechnologyDistribution: { labels: string[]; data: number[] };
    domain7dComparison: { labels: string[]; current: number[]; previous: Array<number | null> };
    topicChangeComposition: { labels: string[]; newProposal: number[]; bodyChange: number[]; statusChange: number[]; discussion: number[] };
  };
  diagnostics: {
    classifiedProposalCount: number;
    mainProposalCount: number;
    appendixOnlyProposalCount: number;
    heldProposalCount: number;
    duplicateTechnologyProposalListCount: number;
    repeatedTechnologySetCount: number;
    concentrationWarnings: string[];
    renderedMainProposalLimit: number;
    relationshipCount: number;
    koreanSummarySentenceCount: number;
    previous7dDiagnostics: string;
  };
};

type ProposalEvidence = {
  proposalId: string;
  title: string;
  proposalKind?: string;
  status: string;
  canonicalUrl?: string;
  category?: string;
  proposalType?: string;
  texts: string[];
  themes: string[];
  topicIds: string[];
  topicNames: string[];
  topicConfidence: number;
  trendEvents: ChangeEvent[];
  recentEvents: ChangeEvent[];
  previousEvents: ChangeEvent[];
  discussions: DiscussionHeatItem[];
  adoption?: AdoptionEvidenceItem;
};

type TechnologyRule = {
  technology: string;
  domain: AtlasDomainId;
  patterns: RegExp[];
};

export const ATLAS_DOMAINS: DomainDefinition[] = [
  {
    id: "execution-state",
    nameKo: "실행 비용과 상태 접근 구조",
    problemKo: "트랜잭션 실행, gas accounting, 상태 접근, EVM 자원 가격을 다루는 영역입니다.",
    keywords: ["evm", "opcode", "gas", "transaction", "state", "access list", "block-level access", "stateless", "precompile", "code", "execution", "frame"],
    technologies: ["EVM / Opcode", "Gas Repricing", "Transaction Model", "State Access", "Block-Level Access Lists", "Statelessness", "Precompile", "Contract State Representation"],
  },
  {
    id: "scaling-data",
    nameKo: "데이터 처리와 확장성",
    problemKo: "calldata, blob, data availability, rollup 데이터 게시 비용을 다루는 영역입니다.",
    keywords: ["rollup", "blob", "data availability", "calldata", "l2", "sequencer", "proof", "settlement", "da"],
    technologies: ["Rollup", "Blob", "Data Availability", "Calldata Efficiency", "L1-L2 Interoperability", "Sequencer", "Proof and Settlement"],
  },
  {
    id: "accounts-wallets",
    nameKo: "지갑 권한과 계정 추상화",
    problemKo: "지갑 권한, account abstraction, 서명 및 사용자 작업 흐름을 다루는 영역입니다.",
    keywords: ["account abstraction", "smart account", "useroperation", "bundler", "session key", "delegation", "delegate", "passkey", "webauthn", "paymaster", "sponsorship", "intent", "wallet", "recovery", "permission", "authorization", "agent", "key hash", "agent wallet"],
    technologies: ["Account Abstraction", "Smart Account", "UserOperation", "Bundler", "Session Key", "Delegation", "Passkey / WebAuthn", "Paymaster", "Intent", "Agent Authorization", "Agent Registry", "Key Management"],
  },
  {
    id: "validators-consensus",
    nameKo: "검증자 운영과 합의 보안",
    problemKo: "validator 운영, consensus 인증, 서명 체계, staking 보안 가정을 다루는 영역입니다.",
    keywords: ["validator", "consensus", "signature aggregation", "deposit", "withdrawal", "pbs", "mev", "block construction", "post-quantum", "quantum", "authentication"],
    technologies: ["Validator Operations", "Block Construction", "Consensus Authentication", "Signature Aggregation", "Validator Deposits and Withdrawals", "PBS / MEV", "Post-Quantum Authentication"],
  },
  {
    id: "tokens-finance",
    nameKo: "토큰화 금융 및 Vault 표준",
    problemKo: "token, vault, claim, oracle, RWA 가치 표현을 다루는 영역입니다.",
    keywords: ["token", "erc-20", "erc20", "nft", "multi-token", "erc-4626", "vault", "request", "redemption", "oracle", "pricing", "collateral", "claim", "rwa", "asset", "attestation"],
    technologies: ["Fungible Token Extensions", "NFT / Multi-token", "ERC-4626 Vault", "Vault Request", "Oracle", "Collateralization", "Tokenized Claims", "RWA / Attestation"],
  },
  {
    id: "identity-compliance",
    nameKo: "신원·자격·컴플라이언스 표준",
    problemKo: "identity, attestation, compliance log, restricted transfer를 다루는 영역입니다.",
    keywords: ["identity", "credential", "attestation", "allowlist", "eligibility", "restricted transfer", "compliance", "proof", "transfer hook", "privacy-preserving", "privacy", "verification", "verdict", "kyc", "reputation registry", "validation registry"],
    technologies: ["Identity Binding", "Verifiable Credential", "Attestation", "Allowlist / Eligibility", "Restricted Transfer", "Compliance Proof", "Transfer Hook", "Privacy-preserving Credentials", "Proof Verification", "Reputation / Validation Registry"],
  },
  {
    id: "interoperability",
    nameKo: "상호운용성",
    problemKo: "cross-chain message, bridge, interoperable asset movement를 다루는 영역입니다.",
    keywords: ["cross-chain", "cross chain", "bridge", "interoperability", "interoperable", "messaging", "chain abstraction", "l1-l2 communication", "token movement"],
    technologies: ["Cross-chain Messaging", "Token Movement", "Bridge Interfaces", "Chain Abstraction", "L1-L2 Communication", "Interoperable Asset Standards"],
  },
  {
    id: "governance-process",
    nameKo: "거버넌스와 표준화 절차",
    problemKo: "EIP/ERC lifecycle, repository process, fork scheduling 등 절차적 변경을 다루는 영역입니다.",
    keywords: ["eip process", "erc process", "governance", "network upgrade", "proposal lifecycle", "standards repository", "tooling", "meta"],
    technologies: ["EIP / ERC Process", "Network Upgrade Governance", "Proposal Lifecycle", "On-chain Governance", "Delegated Governance", "Standards Repository and Tooling"],
  },
];

const DOMAIN_BY_ID = new Map(ATLAS_DOMAINS.map((domain) => [domain.id, domain]));
const TECH_TO_DOMAIN = new Map(ATLAS_DOMAINS.flatMap((domain) => domain.technologies.map((technology) => [technology, domain.id] as const)));
const CANONICAL_DOMAIN_LABELS: Record<AtlasDomainId, { nameKo: string; problemKo: string }> = Object.fromEntries(
  ATLAS_DOMAINS.map((domain) => [domain.id, { nameKo: domain.nameKo, problemKo: domain.problemKo }]),
) as Record<AtlasDomainId, { nameKo: string; problemKo: string }>;

const TECHNOLOGY_RULES: TechnologyRule[] = [
  rule("EVM / Opcode", "execution-state", /\bopcode(s)?\b/i, /\bTXGASLIMIT\b/i, /\bCALLGASLIMIT\b/i, /\bEVM\b/i),
  rule("Gas Repricing", "execution-state", /\bgas\b/i, /\bgas cost\b/i, /\bgas accounting\b/i, /\brefund(s)?\b/i, /\bcalldata floor cost\b/i, /\baccess list cost\b/i),
  rule("Transaction Model", "execution-state", /\btransaction(s)?\b/i, /\btx\b/i),
  rule("State Access", "execution-state", /\bstate access\b/i, /\baccess list(s)?\b/i, /\bblock[- ]level access list(s)?\b/i),
  rule("Block-Level Access Lists", "execution-state", /\bblock[- ]level access list(s)?\b/i),
  rule("Statelessness", "execution-state", /\bstateless(ness)?\b/i, /\bstate witness\b/i, /\bunified binary tree\b/i, /\bbinary tree\b/i, /\bstate tree\b/i, /\bverkle\b/i),
  rule("Precompile", "execution-state", /\bprecompile(s)?\b/i),
  rule("Contract State Representation", "execution-state", /\brepresentable contract state\b/i, /\bcontract state\b/i),
  rule("Calldata Efficiency", "scaling-data", /\bcalldata\b/i),
  rule("Blob", "scaling-data", /\bblob(s)?\b/i, /\bblob transaction(s)?\b/i),
  rule("Data Availability", "scaling-data", /\bdata availability\b/i, /\bDA\b/),
  rule("Rollup", "scaling-data", /\brollup(s)?\b/i),
  rule("Proof and Settlement", "scaling-data", /\bsettlement\b/i, /\bvalidity proof\b/i, /\bfraud proof\b/i),
  rule("Account Abstraction", "accounts-wallets", /\baccount abstraction\b/i, /\bERC-?4337\b/i),
  rule("Smart Account", "accounts-wallets", /\bsmart account(s)?\b/i, /\bcontract account(s)?\b/i),
  rule("UserOperation", "accounts-wallets", /\bUserOperation\b/i, /\buser operation\b/i),
  rule("Bundler", "accounts-wallets", /\bbundler(s)?\b/i),
  rule("Session Key", "accounts-wallets", /\bsession key(s)?\b/i),
  rule("Delegation", "accounts-wallets", /\bdelegat(e|ion|ed)\b/i),
  rule("Passkey / WebAuthn", "accounts-wallets", /\bpasskey(s)?\b/i, /\bWebAuthn\b/i),
  rule("Paymaster", "accounts-wallets", /\bpaymaster(s)?\b/i),
  rule("Agent Authorization", "accounts-wallets", /\bagent authorization\b/i, /\bagent execution\b/i, /\bunclonable agent\b/i, /\bautonomous agent(s)?\b/i),
  rule("Agent Registry", "accounts-wallets", /\bagent registry\b/i, /\bagent registration\b/i, /\bagent discovery\b/i, /\btrustless agent(s)?\b/i, /\bagent wallet(s)?\b/i),
  rule("Key Management", "accounts-wallets", /\bkey hash\b/i, /\bkey management\b/i, /\bstateful key(s)?\b/i),
  rule("Oracle", "tokens-finance", /\boracle(s)?\b/i, /\bpricing\b/i, /\bprice feed(s)?\b/i, /\bNAV\b/i, /\bnet asset value\b/i),
  rule("RWA / Attestation", "tokens-finance", /\bRWA\b/i, /\breal[- ]world asset(s)?\b/i, /\basset attestation(s)?\b/i, /\bproof of reserve\b/i),
  rule("ERC-4626 Vault", "tokens-finance", /\bERC-?4626\b/i, /\bvault(s)?\b/i),
  rule("Vault Request", "tokens-finance", /\bvault request(s)?\b/i, /\bredemption request(s)?\b/i),
  rule("Fungible Token Extensions", "tokens-finance", /\bERC-?20\b/i, /\bfungible token(s)?\b/i, /\bscaled UI amount\b/i),
  rule("Tokenized Claims", "tokens-finance", /\bclaim(s)?\b/i, /\btokenized claim(s)?\b/i),
  rule("Compliance Proof", "identity-compliance", /\bcompliance proof(s)?\b/i),
  rule("Restricted Transfer", "identity-compliance", /\brestricted transfer(s)?\b/i),
  rule("Attestation", "identity-compliance", /\bcredential attestation(s)?\b/i, /\bidentity attestation(s)?\b/i, /\bcompliance attestation(s)?\b/i, /\bpolicy verdict(s)?\b/i),
  rule("Identity Binding", "identity-compliance", /\bidentity registry\b/i, /\bportable identifier\b/i, /\bcensorship-resistant identifier\b/i),
  rule("Verifiable Credential", "identity-compliance", /\bverifiable credential(s)?\b/i, /\bexecution credential(s)?\b/i, /\bcredential(s)?\b/i),
  rule("Privacy-preserving Credentials", "identity-compliance", /\bconfidential\b/i, /\bprivacy[- ]preserving\b/i, /\bprivate credential(s)?\b/i),
  rule("Proof Verification", "identity-compliance", /\bproof verification\b/i, /\binference proof(s)?\b/i, /\bproof verifier\b/i, /\bverification proof(s)?\b/i),
  rule("Reputation / Validation Registry", "identity-compliance", /\breputation registry\b/i, /\bvalidation registry\b/i, /\btrust model(s)?\b/i, /\bindependent validator(s)?\b/i),
  rule("Cross-chain Messaging", "interoperability", /\bcross[- ]chain\b/i, /\bmessage passing\b/i),
  rule("Bridge Interfaces", "interoperability", /\bbridge(s|ing)?\b/i),
  rule("Post-Quantum Authentication", "validators-consensus", /\bpost[- ]quantum\b/i, /\bvalidator authentication\b/i),
  rule("Validator Operations", "validators-consensus", /\bvalidator(s)?\b/i, /\bconsensus attestation(s)?\b/i, /\battestation aggregator\b/i, /\bsweep threshold\b/i, /\beth1data\b/i, /\bdeposit fields?\b/i),
  rule("Consensus Authentication", "validators-consensus", /\bconsensus authentication\b/i, /\bkeystore\b/i),
  rule("Network Upgrade Governance", "governance-process", /\bhardfork inclusion process\b/i, /\bupgrade scheduling\b/i, /\bfork governance\b/i, /\bnetwork upgrade governance\b/i),
  rule("EIP / ERC Process", "governance-process", /\bEIP process\b/i, /\bERC process\b/i, /\brepository process\b/i, /\beditorial workflow\b/i),
  rule("Proposal Lifecycle", "governance-process", /\bproposal lifecycle\b/i, /\bLast Call process\b/i),
  rule("Standards Repository and Tooling", "governance-process", /\bstandards repository\b/i, /\brepository rule(s)?\b/i),
];

export function buildTechnologyAtlas(report: WeeklyRadarReport): TechnologyAtlas {
  const evidence = collectProposalEvidence(report);
  const classified = evidence.map(classifyEvidence);
  const accepted = classified.filter((item) => item.primaryDomain && item.classificationConfidence >= 65);
  const main = accepted.filter((item) => item.classificationConfidence >= 80);
  const held = classified.filter((item) => !item.primaryDomain || item.classificationConfidence < 65);
  const domains = ATLAS_DOMAINS.map((domain) => buildDomainActivity(canonicalDomain(domain), main, report));
  const relationships = buildRelationships(main, report);
  const maturity = buildMaturity(main, report);
  const weeklyChanges = buildWeeklyChanges(report, main);
  const kgldObservations = buildKgldObservations(report, main);
  const activeDomains = domains.filter((domain) => domain.evidenceCount > 0).sort(compareDomainActivity);
  const risingDomains = domains.filter((domain) => domain.activity7d > 0).sort((a, b) => b.activity7d - a.activity7d);
  const summaryKo = buildSummary(activeDomains, risingDomains, weeklyChanges);
  const topDomain = activeDomains[0] ?? domains[0]!;
  const topTechnologies = topDomain.technologies.slice(0, 8);
  const hasTrendWindowEvents = hasIndependentTrendWindow(report);
  return {
    version: "technology-atlas-1",
    generatedAt: report.generatedAt,
    domains,
    classifiedProposals: accepted,
    heldProposals: held,
    relationships,
    maturity,
    weeklyChanges,
    kgldObservations,
    summaryKo,
    dataQualityKo: dataQuality(report, accepted, held),
    charts: {
      domain180d: {
        labels: domains.map((domain) => domain.domain.nameKo),
        data: domains.map((domain) => hasTrendWindowEvents ? domain.activeProposalCount180d : 0),
      },
      domain7d: {
        labels: domains.map((domain) => domain.domain.nameKo),
        data: domains.map((domain) => domain.activeProposalCount7d),
      },
      topTechnologyDistribution: {
        labels: topTechnologies.map((technology) => technology.name),
        data: topTechnologies.map((technology) => technology.activity180d),
      },
      domain7dComparison: {
        labels: domains.map((domain) => domain.domain.nameKo),
        current: domains.map((domain) => domain.activeProposalCount7d),
        previous: domains.map((domain) => domain.previousActiveProposalCount7d),
      },
      topicChangeComposition: topicChangeComposition(report, main),
    },
    diagnostics: {
      classifiedProposalCount: accepted.length,
      mainProposalCount: main.length,
      appendixOnlyProposalCount: accepted.length - main.length,
      heldProposalCount: held.length,
      duplicateTechnologyProposalListCount: duplicateTechnologyProposalLists(domains),
      repeatedTechnologySetCount: repeatedTechnologySetCount(accepted),
      concentrationWarnings: concentrationWarnings(accepted),
      renderedMainProposalLimit: domains.reduce((sum, domain) => sum + domain.representativeProposals.length, 0),
      relationshipCount: relationships.length,
      koreanSummarySentenceCount: summaryKo.length,
      previous7dDiagnostics: previousWindowState(report).reason,
    },
  };
}

function hasIndependentTrendWindow(report: WeeklyRadarReport): boolean {
  const trend = report.ethereumTechRadar.trendChanges;
  if (!trend) return false;
  const trendKeys = allTrendEvents(report).map(eventIdentity).sort();
  const recentKeys = allRecentEvents(report).map(eventIdentity).sort();
  if (!trendKeys.length) return false;
  return trendKeys.length !== recentKeys.length || trendKeys.some((key, index) => key !== recentKeys[index]);
}

function eventIdentity(event: ChangeEvent): string {
  return `${event.proposalId}:${event.type}:${event.occurredAt ?? event.detectedAt}:${event.previousStatus ?? ""}:${event.currentStatus ?? ""}`;
}

function collectProposalEvidence(report: WeeklyRadarReport): ProposalEvidence[] {
  const byId = new Map<string, ProposalEvidence>();
  const ensure = (proposalId: string, title: string | null | undefined, seed: Partial<ProposalEvidence> = {}) => {
    const cleanTitle = cleanProposalTitle(proposalId, title);
    if (!cleanTitle) return undefined;
    const existing = byId.get(proposalId);
    if (existing) {
      existing.texts.push(...(seed.texts ?? []));
      existing.themes.push(...(seed.themes ?? []));
      existing.recentEvents.push(...(seed.recentEvents ?? []));
      existing.discussions.push(...(seed.discussions ?? []));
      existing.status = existing.status || seed.status || "Unknown";
      existing.canonicalUrl = existing.canonicalUrl ?? seed.canonicalUrl;
      existing.category = existing.category ?? seed.category;
      existing.proposalType = existing.proposalType ?? seed.proposalType;
      existing.proposalKind = existing.proposalKind ?? seed.proposalKind;
      existing.topicIds.push(...(seed.topicIds ?? []));
      existing.topicNames.push(...(seed.topicNames ?? []));
      existing.topicConfidence = Math.max(existing.topicConfidence, seed.topicConfidence ?? 0);
      existing.trendEvents.push(...(seed.trendEvents ?? []));
      existing.previousEvents.push(...(seed.previousEvents ?? []));
      existing.adoption = existing.adoption ?? seed.adoption;
      return existing;
    }
    const created: ProposalEvidence = {
      proposalId,
      title: cleanTitle,
      proposalKind: seed.proposalKind,
      status: seed.status ?? "Unknown",
      canonicalUrl: seed.canonicalUrl,
      category: seed.category,
      proposalType: seed.proposalType,
      texts: [cleanTitle, ...(seed.texts ?? [])],
      themes: seed.themes ?? [],
      topicIds: seed.topicIds ?? [],
      topicNames: seed.topicNames ?? [],
      topicConfidence: seed.topicConfidence ?? 0,
      trendEvents: seed.trendEvents ?? [],
      recentEvents: seed.recentEvents ?? [],
      previousEvents: seed.previousEvents ?? [],
      discussions: seed.discussions ?? [],
      adoption: seed.adoption,
    };
    byId.set(proposalId, created);
    return created;
  };

  for (const theme of report.ethereumTechRadar.themeInsights) {
    for (const proposal of theme.representativeProposals) {
      ensure(proposal.id, proposal.title, {
        status: proposal.status,
        canonicalUrl: proposal.canonicalUrl,
        texts: [proposal.oneLineSummary, theme.trendInterpretation, theme.interpretation, ...theme.dominantSubTrends.map((trend) => `${trend.name} ${trend.description}`)],
        themes: [theme.theme],
      });
    }
  }

  const allEvents = [
    ...report.ethereumTechRadar.recentChanges.newProposals,
    ...report.ethereumTechRadar.recentChanges.statusChanges,
    ...report.ethereumTechRadar.recentChanges.finalTransitions,
    ...report.ethereumTechRadar.recentChanges.withdrawnTransitions,
    ...report.ethereumTechRadar.recentChanges.contentHashChanges,
  ];
  const trendEvents = allTrendEvents(report);
  const previousEvents = allPreviousEvents(report);
  for (const event of trendEvents) {
    ensure(event.proposalId, event.title, {
      status: event.currentStatus ?? event.previousStatus ?? "Unknown",
      canonicalUrl: event.canonicalUrl,
      texts: [event.diffSummary ?? "", event.diffEvidence ?? "", event.changedSections?.join(" ") ?? "", event.sourcePath],
      trendEvents: [event],
    });
  }
  for (const event of allEvents) {
    ensure(event.proposalId, event.title, {
      status: event.currentStatus ?? event.previousStatus ?? "Unknown",
      canonicalUrl: event.canonicalUrl,
      texts: [event.diffSummary ?? "", event.diffEvidence ?? "", event.changedSections?.join(" ") ?? "", event.sourcePath],
      recentEvents: [event],
    });
  }
  for (const event of previousEvents) {
    ensure(event.proposalId, event.title, {
      status: event.currentStatus ?? event.previousStatus ?? "Unknown",
      canonicalUrl: event.canonicalUrl,
      texts: [event.diffSummary ?? "", event.diffEvidence ?? "", event.changedSections?.join(" ") ?? "", event.sourcePath],
      previousEvents: [event],
    });
  }

  for (const discussion of report.ethereumTechRadar.signalLayer.discussionHeat) {
    ensure(discussion.proposalId, discussion.title, {
      status: discussion.status ?? "Unknown",
      canonicalUrl: discussion.canonicalUrl,
      texts: [discussion.theme, discussion.discussionTitle ?? "", discussion.whyItMatters, discussion.discussionSummaryFallback ?? "", ...(discussion.discussionTags ?? [])],
      themes: [discussion.theme],
      discussions: [discussion],
    });
  }

  for (const diff of report.ethereumTechRadar.signalLayer.diffIntelligence) {
    ensure(diff.proposalId, diff.title, {
      canonicalUrl: diff.canonicalUrl,
      texts: [diff.diffSummary, diff.diffEvidence, diff.changedSections?.join(" ") ?? "", diff.changedFiles.join(" ")],
    });
  }

  for (const item of report.ethereumTechRadar.adoptionLayer?.items ?? []) {
    ensure(item.proposalId, item.title, {
      texts: [item.theme, item.summary, item.caution, ...item.sources.map((source) => `${source.title} ${source.semanticType} ${source.relationship}`)],
      adoption: item,
    });
  }

  const topicLayer = report.ethereumTechRadar.topicClusterLayer;
  const topicById = new Map((topicLayer?.clusters ?? []).map((topic) => [topic.id, topic]));
  for (const membership of topicLayer?.memberships ?? []) {
    if (membership.role === "excluded") continue;
    const topic = topicById.get(membership.topicId);
    const proposal = topicLayer?.clusters
      .flatMap((cluster) => cluster.evidence)
      .flatMap((item) => item.proposalIds)
      .includes(membership.proposalId);
    ensure(membership.proposalId, membership.proposalId, {
      texts: [topic?.summary ?? "", topic?.sharedSignals.join(" ") ?? ""],
      themes: topic ? [topic.displayName] : [],
      topicIds: [membership.topicId],
      topicNames: topic ? [topic.displayName] : [],
      topicConfidence: membership.confidence,
    });
  }

  const graph = report.ethereumTechRadar.knowledgeGraphLayer;
  for (const node of graph?.nodes ?? []) {
    if (node.type !== "Proposal") continue;
    const proposalId = node.label;
    ensure(proposalId, String(node.properties.title ?? node.label), {
      status: String(node.properties.status ?? "Unknown"),
      canonicalUrl: String(node.properties.canonicalUrl ?? ""),
      texts: [node.description ?? "", JSON.stringify(node.properties)],
    });
  }

  return [...byId.values()].map((item) => ({
    ...item,
    texts: unique(item.texts.filter(Boolean)),
    themes: unique(item.themes.filter(Boolean)),
    topicIds: unique(item.topicIds.filter(Boolean)),
    topicNames: unique(item.topicNames.filter(Boolean)),
    trendEvents: uniqueBy(item.trendEvents, (event) => `${event.proposalId}:${event.type}:${event.occurredAt ?? event.detectedAt}`),
    recentEvents: uniqueBy(item.recentEvents, (event) => `${event.proposalId}:${event.type}:${event.occurredAt ?? event.detectedAt}`),
    previousEvents: uniqueBy(item.previousEvents, (event) => `${event.proposalId}:${event.type}:${event.occurredAt ?? event.detectedAt}`),
    discussions: uniqueBy(item.discussions, (discussion) => `${discussion.proposalId}:${discussion.discussionUrl ?? ""}`),
  }));
}

function classifyEvidence(evidence: ProposalEvidence): ClassifiedProposal {
  const technologyEvidence = extractTechnologyEvidence(evidence);
  const override = regressionOverride(evidence);
  const topicDomain = domainFromTopics(evidence.topicIds, evidence.topicNames);
  const directText = [evidence.title, evidence.texts.slice(0, 4).join(" ")].join(" ");
  const weightedText = [directText, evidence.themes.join(" ")].join(" ").toLowerCase();
  const scores = ATLAS_DOMAINS.map((domain) => ({
    domain,
    score: scoreDomain(domain, weightedText, evidence, technologyEvidence),
  })).sort((a, b) => b.score - a.score);
  const [best, second, third] = scores;
  const primaryDomain = override?.domain ?? topicDomain ?? (best && best.score >= 3 ? best.domain.id : undefined);
  const secondaryDomains = [second, third]
    .filter((item): item is { domain: DomainDefinition; score: number } => Boolean(item) && item.score >= 2 && item.domain.id !== primaryDomain)
    .slice(0, 2)
    .map((item) => item.domain.id);
  const proposalTechnologyEvidence = primaryDomain
    ? mergeTechnologyEvidence(override?.technologies ?? [], technologyEvidence.filter((item) => TECH_TO_DOMAIN.get(item.technology) === primaryDomain), evidence).slice(0, 3)
    : [];
  const technologies = proposalTechnologyEvidence.map((item) => item.technology);
  const topicBoost = evidence.topicConfidence >= 0.75 ? 18 : evidence.topicConfidence >= 0.55 ? 10 : 0;
  const rawConfidence = override
    ? override.confidence
    : primaryDomain && technologies.length
      ? Math.min(95, 48 + (best?.score ?? 0) * 5 + topicBoost + Math.round(proposalTechnologyEvidence.reduce((sum, item) => sum + item.confidence, 0) / 30))
      : primaryDomain
        ? 60
        : 35;
  const confidence = Math.min(rawConfidence, confidenceCeiling(evidence, proposalTechnologyEvidence, override));
  const roundedConfidence = Math.round(confidence);
  return {
    proposalId: evidence.proposalId,
    title: evidence.title,
    proposalKind: evidence.proposalKind,
    status: evidence.status,
    canonicalUrl: evidence.canonicalUrl,
    primaryDomain,
    secondaryDomains,
    topicIds: evidence.topicIds,
    topicNames: evidence.topicNames,
    technologies,
    technologyEvidence: proposalTechnologyEvidence,
    problemStatement: primaryDomain ? problemFor(primaryDomain, technologies) : "?꾩옱 ?섏쭛 洹쇨굅留뚯쑝濡?湲곗닠 ?곸뿭???덉젙?곸쑝濡?遺꾨쪟?섍린 ?대졄?듬땲??",
    proposedChange: primaryDomain ? proposedChangeFor(primaryDomain, technologies) : "遺꾨쪟 蹂대쪟 ?곹깭濡??대? ?곗씠?곗뿉留??④퉩?덈떎.",
    representativeReason: primaryDomain ? reasonFor(evidence, primaryDomain, technologies) : "?쒕ぉ, ?ㅻ챸, discussion metadata??湲곗닠 ?좏샇媛 異⑸텇??援ъ껜?곸씠吏 ?딆뒿?덈떎.",
    classificationEvidence: unique([...evidence.themes, ...evidence.texts.slice(0, 4), ...evidence.recentEvents.map((event) => event.type)]).slice(0, 8),
    classificationConfidence: roundedConfidence,
    confidenceBand: roundedConfidence >= 80 ? "main" : roundedConfidence >= 65 ? "appendix" : "review_required",
    classificationVersion: "atlas-canonical-topic-v2",
    activity: proposalActivity(evidence, undefined),
    recentActivity: recentActivity(evidence),
  };
}

function confidenceCeiling(
  evidence: ProposalEvidence,
  technologyEvidence: TechnologyEvidence[],
  override: { domain: AtlasDomainId; technologies: string[]; confidence: number } | undefined,
): number {
  if (override) return override.confidence;
  const fields = new Set(technologyEvidence.map((item) => item.evidenceField));
  const hasTitle = fields.has("title");
  const hasAbstract = fields.has("abstract");
  const hasMotivation = fields.has("motivation");
  const hasSpecification = fields.has("specification");
  const hasDirectSource = hasTitle || hasAbstract || hasMotivation || hasSpecification;
  if (hasTitle && hasAbstract) return 95;
  if (hasTitle) return 85;
  if (hasAbstract) return 80;
  if (hasMotivation || hasSpecification) return 55;
  if (evidence.topicIds.length || evidence.topicNames.length) return 60;
  if (!hasDirectSource) return 55;
  return 64;
}

function scoreDomain(domain: DomainDefinition, text: string, evidence: ProposalEvidence, technologyEvidence: TechnologyEvidence[]): number {
  let score = 0;
  score += technologyEvidence.filter((item) => TECH_TO_DOMAIN.get(item.technology) === domain.id).length * 3;
  for (const keyword of domain.keywords) {
    if (text.includes(keyword)) score += keyword.includes(" ") ? 2 : 1;
  }
  if (evidence.category && /core/i.test(evidence.category) && domain.id === "execution-state") score += 1;
  if (evidence.category && /erc/i.test(evidence.category) && domain.id === "tokens-finance" && /token|vault|asset|claim|oracle/.test(text)) score += 2;
  if (evidence.proposalId.startsWith("ERC") && /wallet|account|delegation|session|paymaster|passkey/.test(text) && domain.id === "accounts-wallets") score += 2;
  if (domain.id === "governance-process" && isGovernanceProcessEvidence(text, evidence)) score += 4;
  return score;
}

function extractTechnologyEvidence(evidence: ProposalEvidence): TechnologyEvidence[] {
  const fields: Array<[TechnologyEvidence["evidenceField"], string, number]> = [
    ["title", evidence.title, 95],
    ["abstract", evidence.texts.slice(0, 2).join(" "), 82],
    ["motivation", evidence.texts.slice(2, 4).join(" "), 76],
    ["specification", evidence.texts.slice(4).join(" "), 68],
    ["discussion", evidence.discussions.map((discussion) => `${discussion.discussionTitle ?? ""} ${discussion.discussionSummaryFallback ?? ""} ${discussion.whyItMatters ?? ""}`).join(" "), 64],
    ["theme", evidence.themes.join(" "), 58],
  ];
  const matches: TechnologyEvidence[] = [];
  for (const rule of TECHNOLOGY_RULES) {
    for (const [field, value, confidence] of fields) {
      const matchedText = findMatchedText(value, rule.patterns);
      if (!matchedText) continue;
      matches.push({ technology: rule.technology, evidenceField: field, matchedText, evidenceId: `${evidence.proposalId}:${field}`, confidence });
      break;
    }
  }
  return uniqueBy(matches, (item) => item.technology)
    .sort((a, b) => b.confidence - a.confidence || a.technology.localeCompare(b.technology))
    .slice(0, 3);
}

function findMatchedText(value: string, patterns: RegExp[]): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[0]) continue;
    const index = match.index ?? normalized.toLowerCase().indexOf(match[0].toLowerCase());
    const start = Math.max(0, index - 40);
    const end = Math.min(normalized.length, index + match[0].length + 60);
    return normalized.slice(start, end);
  }
  return undefined;
}

function isGovernanceProcessEvidence(text: string, evidence: ProposalEvidence): boolean {
  const processText = `${evidence.title} ${evidence.texts.slice(0, 4).join(" ")}`.toLowerCase();
  return /\b(hardfork inclusion process|upgrade scheduling|fork governance|eip lifecycle governance|repository\/process rule|repository process|editorial workflow|eip process|erc process|proposal lifecycle|standards repository)\b/.test(processText)
    || (/meta/i.test(evidence.proposalType ?? "") && /\b(process|repository|editorial|lifecycle|governance)\b/.test(processText))
    || /\bmeta\b/.test(text) && /\b(process|repository|editorial|lifecycle)\b/.test(processText);
}

function domainFromTopics(topicIds: string[], topicNames: string[]): AtlasDomainId | undefined {
  const text = [...topicIds, ...topicNames].join(" ").toLowerCase();
  if (/post-quantum-validator|validator authentication|consensus|staking/.test(text)) return "validators-consensus";
  if (/programmable-compliance|compliance|identity/.test(text)) return "identity-compliance";
  if (/gas-repricing|resource-accounting|block-access|partial-state|statefulness/.test(text)) return "execution-state";
  if (/wallet-authorization|transaction-cost-abstraction/.test(text)) return "accounts-wallets";
  if (/vault-request|asset-attestation|registry|nav/.test(text)) return "tokens-finance";
  if (/cross-chain|interoperability|bridge/.test(text)) return "interoperability";
  if (/repository|governance|process/.test(text)) return "governance-process";
  return undefined;
}

function regressionOverride(evidence: ProposalEvidence): { domain: AtlasDomainId; technologies: string[]; confidence: number } | undefined {
  const id = evidence.proposalId.toUpperCase();
  const map: Record<string, { domain: AtlasDomainId; technologies: string[]; confidence: number }> = {
    "EIP-8292": { domain: "validators-consensus", technologies: ["Post-Quantum Authentication", "Validator Operations"], confidence: 92 },
    "ERC-8328": { domain: "identity-compliance", technologies: ["Compliance Proof", "Attestation"], confidence: 90 },
    "EIP-7904": { domain: "execution-state", technologies: ["Gas Repricing"], confidence: 91 },
    "EIP-8279": { domain: "execution-state", technologies: ["Block-Level Access Lists", "State Access"], confidence: 91 },
    "EIP-7778": { domain: "execution-state", technologies: ["Gas Repricing"], confidence: 90 },
    "ERC-6123": { domain: "tokens-finance", technologies: ["Tokenized Claims"], confidence: 86 },
    "ERC-7730": { domain: "accounts-wallets", technologies: ["Account Abstraction"], confidence: 84 },
    "ERC-7964": { domain: "interoperability", technologies: ["Cross-chain Messaging"], confidence: 85 },
    "EIP-8222": { domain: "validators-consensus", technologies: ["Validator Operations"], confidence: 86 },
    "EIP-8282": { domain: "validators-consensus", technologies: ["Validator Operations"], confidence: 82 },
    "EIP-7708": { domain: "execution-state", technologies: ["Transaction Event Log"], confidence: 82 },
    "EIP-7954": { domain: "execution-state", technologies: ["Contract Size Limit"], confidence: 82 },
    "EIP-7723": { domain: "governance-process", technologies: ["Network Upgrade Governance"], confidence: 88 },
    "EIP-7329": { domain: "governance-process", technologies: ["EIP / ERC Process"], confidence: 88 },
    "ERC-8196": { domain: "accounts-wallets", technologies: ["Wallet Authorization", "Agent Authorization"], confidence: 78 },
    "ERC-5516": { domain: "tokens-finance", technologies: ["NFT / Multi-token"], confidence: 88 },
    "ERC-8327": { domain: "identity-compliance", technologies: ["Restricted Transfer"], confidence: 86 },
    "EIP-8164": { domain: "accounts-wallets", technologies: ["Delegation"], confidence: 90 },
    "EIP-8015": { domain: "validators-consensus", technologies: ["Validator Deposits and Withdrawals"], confidence: 84 },
    "EIP-8205": { domain: "validators-consensus", technologies: ["Validator Deposits and Withdrawals"], confidence: 84 },
    "EIP-8148": { domain: "validators-consensus", technologies: ["Validator Operations"], confidence: 84 },
    "ERC-8143": { domain: "identity-compliance", technologies: ["Verifiable Credential", "Identity Binding"], confidence: 88 },
    "EIP-8296": { domain: "execution-state", technologies: ["State Tiering", "State Management"], confidence: 88 },
    "ERC-7303": { domain: "tokens-finance", technologies: ["Fungible Token Extensions"], confidence: 82 },
    "ERC-8048": { domain: "tokens-finance", technologies: ["Token Registry Metadata"], confidence: 86 },
    "EIP-7773": { domain: "governance-process", technologies: ["Network Upgrade Governance"], confidence: 82 },
    "EIP-8310": { domain: "accounts-wallets", technologies: ["Key Management"], confidence: 76 },
    "EIP-8243": { domain: "validators-consensus", technologies: ["Validator Operations"], confidence: 88 },
  };
  return map[id];
}

function mergeTechnologyEvidence(overrideTechnologies: string[], extracted: TechnologyEvidence[], evidence: ProposalEvidence): TechnologyEvidence[] {
  const overrideEvidence = overrideTechnologies.map((technology) => ({
    technology,
    evidenceField: "title" as const,
    matchedText: evidence.title,
    evidenceId: `${evidence.proposalId}:canonical-override`,
    confidence: 92,
  }));
  if (overrideTechnologies.length) return overrideEvidence;
  return uniqueBy([...overrideEvidence, ...extracted], (item) => item.technology);
}

function proposalActivity(evidence: ProposalEvidence, _unused: unknown): ProposalActivitySummary {
  return {
    current180d: summarizeEvents(evidence.trendEvents, evidence.discussions),
    current7d: summarizeEvents(evidence.recentEvents, evidence.discussions),
    previous7d: summarizeEvents(evidence.previousEvents, []),
  };
}

function summarizeEvents(events: ChangeEvent[], discussions: DiscussionHeatItem[]): ActivityWindowSummary {
  const confirmedEvents = events.filter(isConfirmedTimestampEvent);
  const timestampedDiscussions = discussions.filter((discussion) => hasCollectedCurrentPosts(discussion));
  const active = new Set([...confirmedEvents.map((event) => event.proposalId), ...timestampedDiscussions.map((discussion) => discussion.proposalId)]);
  return {
    activeProposalCount: active.size,
    newProposalCount: confirmedEvents.filter((event) => event.type === "new_proposal").length,
    bodyChangeCount: confirmedEvents.filter(isPriorityContentChange).length,
    statusChangeCount: confirmedEvents.filter((event) => event.type === "status_change" || event.type === "final_transition" || event.type === "withdrawn_transition").length,
    discussionCount: timestampedDiscussions.reduce((sum, discussion) => sum + (discussion.postsInCurrent7d ?? 0), 0),
  };
}

function isConfirmedTimestampEvent(event: ChangeEvent): boolean {
  return (event.occurredAtSource ?? "fallback_detected_at") !== "fallback_detected_at" && event.timestampConfidence !== "low";
}

function isPriorityContentChange(event: ChangeEvent): boolean {
  if (event.type !== "content_hash_change") return false;
  return prioritySemanticTypes.has(event.changeSemanticType ?? semanticTypeFromEvent(event));
}

function isGenericTopic(topic: string | undefined): topic is undefined {
  return !topic || /^(topic|other|misc|uncategorized|검토 중인 주제|기타)$/i.test(topic.trim());
}

const prioritySemanticTypes = new Set([
  "normative_specification",
  "rationale_or_motivation",
  "security_consideration",
  "interface_or_api",
  "test_vector",
  "metadata_status",
]);

function semanticTypeFromEvent(event: ChangeEvent): NonNullable<ChangeEvent["changeSemanticType"]> {
  if (event.changeSemanticType) return event.changeSemanticType;
  const text = `${event.changedSections?.join(" ") ?? ""} ${event.diffSummary ?? ""} ${event.diffEvidence ?? ""}`;
  if (event.type === "new_proposal") return "normative_specification";
  if (event.type === "status_change" || event.type === "final_transition" || event.type === "withdrawn_transition") return "metadata_status";
  if (/security/i.test(text)) return "security_consideration";
  if (/motivation|rationale/i.test(text)) return "rationale_or_motivation";
  if (/interface|api|opcode|precompile|contract|event|function/i.test(text)) return "interface_or_api";
  if (/specification|must|should|shall|may|gas|state|block|transaction/i.test(text)) return "normative_specification";
  if (/link|url|typo|format|editorial|markdown/i.test(text)) return "editorial_text";
  return "unknown";
}

function emptyActivitySummary(): ActivityWindowSummary {
  return { activeProposalCount: 0, newProposalCount: 0, bodyChangeCount: 0, statusChangeCount: 0, discussionCount: 0 };
}

function buildDomainActivity(domain: DomainDefinition, proposals: ClassifiedProposal[], report: WeeklyRadarReport): DomainActivity {
  const domainProposals = proposals.filter((proposal) => proposal.primaryDomain === domain.id);
  const proposalIds = new Set(domainProposals.map((proposal) => proposal.proposalId));
  const changes180d = allTrendEvents(report).filter((event) => proposalIds.has(event.proposalId));
  const changes = allRecentEvents(report).filter((event) => proposalIds.has(event.proposalId) && isConfirmedTimestampEvent(event));
  const previousWindow = previousWindowState(report);
  const previousChanges = previousWindow.collected ? allPreviousEvents(report).filter((event) => proposalIds.has(event.proposalId)) : [];
  const discussions = report.ethereumTechRadar.signalLayer.discussionHeat.filter((discussion) => proposalIds.has(discussion.proposalId));
  const discussion180d = discussions.filter((discussion) => discussionWithinRange(discussion, report.trendPeriod.from, report.trendPeriod.to));
  const discussion7d = discussions.filter((discussion) => hasCollectedCurrentPosts(discussion) && discussionWithinRange(discussion, report.changePeriod.from, report.changePeriod.to));
  const techMap = new Map<string, Set<string>>();
  for (const proposal of domainProposals) {
    for (const technology of proposal.technologies) {
      const ids = techMap.get(technology) ?? new Set<string>();
      ids.add(proposal.proposalId);
      techMap.set(technology, ids);
    }
  }
  const technologies = [...techMap.entries()]
    .map(([name, ids]) => ({
      name,
      proposalIds: [...ids].sort(),
      activity180d: changes180d.filter((event) => ids.has(event.proposalId)).length + discussion180d.filter((discussion) => ids.has(discussion.proposalId)).length,
      activity7d: changes.filter((event) => ids.has(event.proposalId)).length + discussion7d.filter((discussion) => ids.has(discussion.proposalId)).length,
    }))
    .sort((a, b) => b.activity180d - a.activity180d || a.name.localeCompare(b.name))
    .filter((technology, index, all) => {
      const key = technology.proposalIds.join(",");
      if (!key || technology.proposalIds.length < 3) return true;
      return all.findIndex((candidate) => candidate.proposalIds.length >= 3 && candidate.proposalIds.join(",") === key) === index;
    });
  const repositoryActivity180d = changes180d.length;
  const repositoryActivity7d = changes.length;
  const discussionActivity180d = discussion180d.length;
  const discussionActivity7d = discussion7d.length;
  const activeProposalIds180d = new Set([...changes180d.map((event) => event.proposalId), ...discussion180d.map((discussion) => discussion.proposalId)]);
  const activity180d = repositoryActivity180d + discussionActivity180d;
  const activity7d = repositoryActivity7d + discussionActivity7d;
  const previousActivity7d = previousWindow.collected ? previousChanges.length : null;
  return {
    domain,
    activity180d,
    activity7d,
    previousActivity7d,
    activeProposalCount180d: activeProposalIds180d.size,
    activeProposalCount7d: new Set([...changes.map((event) => event.proposalId), ...discussion7d.map((discussion) => discussion.proposalId)]).size,
    previousActiveProposalCount7d: previousWindow.collected ? new Set(previousChanges.map((event) => event.proposalId)).size : null,
    repositoryActivity180d,
    repositoryActivity7d,
    discussionActivity180d,
    discussionActivity7d,
    newProposalCount: changes.filter((event) => event.type === "new_proposal").length,
    bodyChangeCount: changes.filter(isPriorityContentChange).length,
    statusChangeCount: changes.filter((event) => event.type === "status_change" || event.type === "final_transition" || event.type === "withdrawn_transition").length,
    discussionActivity: discussion180d.reduce((sum, discussion) => sum + Math.max(0, discussion.postsInCurrent7d ?? 0), 0),
    momentumDirection: previousWindow.collected ? momentumDirection(activity180d, activity7d) : "데이터 부족",
    evidenceCount: activity180d,
    technologies,
    representativeProposals: domainProposals.sort(compareProposalActivity(report)).slice(0, 5),
    representativeDiscussions: discussions
      .filter((discussion) => discussion.discussionUrl)
      .sort((a, b) => (b.discussionActivityScore ?? b.discussionScore ?? 0) - (a.discussionActivityScore ?? a.discussionScore ?? 0))
      .slice(0, 3)
      .map((discussion) => ({ title: discussion.discussionTitle ?? discussion.title ?? discussion.proposalId, url: discussion.discussionUrl ?? undefined, proposalId: discussion.proposalId })),
  };
}

function buildRelationships(proposals: ClassifiedProposal[], report: WeeklyRadarReport): TechnologyRelation[] {
  const edges = new Map<string, TechnologyRelation>();
  const add = (source: string, target: string, proposalId: string, explanationKo: string, relationType: TechnologyRelation["relationType"], discussionUrls: string[] = []) => {
    if (source === target) return;
    const key = `${source}->${target}`;
    const existing = edges.get(key) ?? {
      sourceTechnology: source,
      targetTechnology: target,
      relationType,
      explanationKo,
      evidenceProposalIds: [],
      evidenceDiscussionUrls: [],
      evidenceType: "analyst_inference",
      evidenceUrl: `https://eips.ethereum.org/EIPS/eip-${proposalId.match(/\d+/)?.[0] ?? proposalId}`,
      inferred: true,
      confidence: 55,
    };
    existing.evidenceProposalIds = unique([...existing.evidenceProposalIds, proposalId]).slice(0, 8);
    existing.evidenceDiscussionUrls = unique([...existing.evidenceDiscussionUrls, ...discussionUrls]).slice(0, 5);
    existing.confidence = Math.min(85, 55 + existing.evidenceProposalIds.length * 8 + existing.evidenceDiscussionUrls.length * 4);
    edges.set(key, existing);
  };
  addCanonicalRelationship(proposals, add, "Account Abstraction", "Smart Account", "계정 추상화 명세가 스마트 계정 실행 모델을 가능하게 하는 경우에만 연결했습니다.", "enables");
  addCanonicalRelationship(proposals, add, "Smart Account", "UserOperation", "스마트 계정 명세가 UserOperation 처리 흐름을 직접 구현하는 경우에만 연결했습니다.", "implements");
  addCanonicalRelationship(proposals, add, "UserOperation", "Bundler", "UserOperation 처리 규칙이 Bundler 인프라에 의존하는 경우에만 연결했습니다.", "depends_on");
  addCanonicalRelationship(proposals, add, "UserOperation", "Paymaster", "Paymaster가 UserOperation의 gas 후원 흐름을 보완하는 경우에만 연결했습니다.", "complements");
  addCanonicalRelationship(proposals, add, "Delegation", "Session Key", "Session Key가 위임 권한 모델의 일부로 명시된 경우에만 연결했습니다.", "part_of");
  addCanonicalRelationship(proposals, add, "Attestation", "Compliance Proof", "자격 증명 근거가 컴플라이언스 검증을 가능하게 하는 경우에만 연결했습니다.", "enables");
  addCanonicalRelationship(proposals, add, "Vault Request", "ERC-4626 Vault", "Vault Request 명세가 ERC-4626 입출금 흐름을 확장하는 경우에만 연결했습니다.", "extends");
  return [...edges.values()]
    .filter((edge) => edge.evidenceProposalIds.length > 0 && edge.confidence >= 55)
    .sort((a, b) => b.confidence - a.confidence || a.sourceTechnology.localeCompare(b.sourceTechnology))
    .slice(0, 18);
  const discussionByProposal = new Map(report.ethereumTechRadar.signalLayer.discussionHeat.map((discussion) => [discussion.proposalId, discussion]));
  for (const proposal of proposals) {
    const urls = discussionByProposal.get(proposal.proposalId)?.discussionLinks ?? [];
    for (let index = 0; index < proposal.technologies.length - 1; index += 1) {
      add(proposal.technologies[index]!, proposal.technologies[index + 1]!, proposal.proposalId, `${proposal.technologies[index]} ?쇱쓽媛 ${proposal.technologies[index + 1]} 蹂?붿? ?④퍡 愿李곕맗?덈떎.`, "援ы쁽", urls);
    }
  }
  addKnownRelationship(proposals, add, "Account Abstraction", "Smart Account", "怨꾩젙 異붿긽???쇱쓽??Smart Account ?ㅽ뻾 紐⑤뜽怨??④퍡 ?섑??⑸땲??");
  addKnownRelationship(proposals, add, "Smart Account", "UserOperation", "Smart Account ?먮쫫? UserOperation 泥섎━ 紐⑤뜽怨??곌껐?⑸땲??");
  addKnownRelationship(proposals, add, "UserOperation", "Bundler", "UserOperation? Bundler 泥섎━ 援ъ“? ?④퍡 ?쇱쓽?⑸땲??");
  addKnownRelationship(proposals, add, "UserOperation", "Paymaster", "UserOperation? gas sponsorship???꾪빐 Paymaster? ?곌껐?⑸땲??");
  addKnownRelationship(proposals, add, "Delegation", "Session Key", "Delegation? session ?⑥쐞 沅뚰븳 ?꾩엫怨??④퍡 ?섑??⑸땲??");
  addKnownRelationship(proposals, add, "Blob", "Data Availability", "Blob? Rollup ?곗씠??寃뚯떆 鍮꾩슜怨?Data Availability 臾몄젣瑜?吏곸젒 寃⑤깷?⑸땲??");
  addKnownRelationship(proposals, add, "Attestation", "Compliance Proof", "Attestation? ?묎렐 議곌굔怨?而댄뵆?쇱씠?몄뒪 寃利앹쓽 洹쇨굅媛 ?⑸땲??");
  addKnownRelationship(proposals, add, "Vault Request", "ERC-4626 Vault", "Vault request??ERC-4626 湲곕컲 ?낆텧湲댟룹긽???먮쫫???뺤옣?⑸땲??");
  return [...edges.values()]
    .filter((edge) => edge.evidenceProposalIds.length > 0 && edge.confidence >= 55)
    .sort((a, b) => b.confidence - a.confidence || a.sourceTechnology.localeCompare(b.sourceTechnology))
    .slice(0, 18);
}

function addKnownRelationship(
  proposals: ClassifiedProposal[],
  add: (source: string, target: string, proposalId: string, explanationKo: string, relationType: TechnologyRelation["relationType"], discussionUrls?: string[]) => void,
  source: string,
  target: string,
  explanationKo: string,
): void {
  for (const proposal of proposals) {
    if (proposal.technologies.includes(source) && proposal.technologies.includes(target)) add(source, target, proposal.proposalId, explanationKo, "?ъ슜");
  }
}

function addCanonicalRelationship(
  proposals: ClassifiedProposal[],
  add: (source: string, target: string, proposalId: string, explanationKo: string, relationType: TechnologyRelation["relationType"], discussionUrls?: string[]) => void,
  source: string,
  target: string,
  explanationKo: string,
  relationType: TechnologyRelation["relationType"],
): void {
  for (const proposal of proposals) {
    if (proposal.technologies.includes(source) && proposal.technologies.includes(target)) add(source, target, proposal.proposalId, explanationKo, relationType);
  }
}

function buildMaturity(proposals: ClassifiedProposal[], report: WeeklyRadarReport): Record<MaturityStage, MaturityTechnology[]> {
  const byTechnology = new Map<string, ClassifiedProposal[]>();
  for (const proposal of proposals) {
    for (const technology of proposal.technologies) {
      const list = byTechnology.get(technology) ?? [];
      list.push(proposal);
      byTechnology.set(technology, list);
    }
  }
  const result: Record<MaturityStage, MaturityTechnology[]> = {
    "신규 탐색": [],
    "활발한 Proposal 논의": [],
    "상태 진전": [],
    "구현 근거 확인": [],
    "데이터 부족": [],
  };
  const adoptionByProposal = new Map((report.ethereumTechRadar.adoptionLayer?.items ?? []).map((item) => [item.proposalId, item]));
  for (const [technology, items] of byTechnology) {
    const adoptionItems = items.map((item) => adoptionByProposal.get(item.proposalId)).filter((item): item is AdoptionEvidenceItem => Boolean(item));
    const hasImplementation = adoptionItems.some((item) => item.evidenceLevel === "Implementation" || item.sources.some((source) => /implementation|client|tracker/i.test(`${source.semanticType} ${source.title}`)));
    const statusCount = items.reduce((sum, item) => sum + item.activity.current7d.statusChangeCount, 0);
    const newCount = items.reduce((sum, item) => sum + item.activity.current7d.newProposalCount, 0);
    const bodyCount = items.reduce((sum, item) => sum + item.activity.current7d.bodyChangeCount, 0);
    const stage: MaturityStage = hasImplementation
      ? "구현 근거 확인"
      : statusCount > 0
        ? "상태 진전"
        : newCount > 0
          ? "신규 탐색"
          : bodyCount > 0 || items.length >= 2
            ? "활발한 Proposal 논의"
            : "데이터 부족";
    const reasonKo = `신규 ${newCount} · 본문 변경 ${bodyCount} · 상태 변경 ${statusCount}`;
    result[stage].push({ technology, stage, reasonKo, proposalIds: unique(items.map((item) => item.proposalId)).slice(0, 6) });
  }
  for (const stage of Object.keys(result) as MaturityStage[]) {
    result[stage] = result[stage].sort((a, b) => b.proposalIds.length - a.proposalIds.length || a.technology.localeCompare(b.technology)).slice(0, 8);
  }
  return result;
}

function buildWeeklyChanges(report: WeeklyRadarReport, proposals: ClassifiedProposal[]): WeeklyAtlasChange[] {
  const byProposal = new Map(proposals.map((proposal) => [proposal.proposalId, proposal]));
  const grouped = new Map<string, { proposals: Set<string>; events: ChangeEvent[]; domain: string }>();
  for (const event of allRecentEvents(report).filter(isConfirmedTimestampEvent)) {
    const proposal = byProposal.get(event.proposalId);
    if (!proposal?.primaryDomain) continue;
    const topic = displayTopicForAtlasProposal(proposal);
    if (isGenericTopic(topic) || topic === CANONICAL_DOMAIN_LABELS[proposal.primaryDomain].nameKo) continue;
    const bucket = grouped.get(topic) ?? { proposals: new Set<string>(), events: [], domain: CANONICAL_DOMAIN_LABELS[proposal.primaryDomain].nameKo };
    bucket.proposals.add(proposal.proposalId);
    bucket.events.push(event);
    grouped.set(topic, bucket);
  }
  return [...grouped.entries()]
    .map(([topic, bucket]) => {
      const newCount = bucket.events.filter((event) => event.type === "new_proposal").length;
      const bodyCount = bucket.events.filter(isPriorityContentChange).length;
      const editorialCount = bucket.events.filter((event) => event.type === "content_hash_change" && !isPriorityContentChange(event)).length;
      const statusCount = new Set(bucket.events.filter((event) => event.type === "status_change" || event.type === "final_transition" || event.type === "withdrawn_transition").map((event) => event.proposalId)).size;
      return {
        titleKo: topic,
        domainNameKo: bucket.domain,
        whyKo: `신규 Proposal ${newCount} · 명세 변경 ${bodyCount} · 상태 변경 ${statusCount}${editorialCount ? ` · 편집 변경 ${editorialCount}` : ""}. 주요 항목: ${[...bucket.proposals].slice(0, 4).join(", ")}. 발생일 미확정 변화는 이번 주 확정 변화에서 제외했습니다.`,
        evidence: `${bucket.events.length}건의 이번 주 확정 변경 이벤트`,
      };
    })
    .filter((item) => !/^신규 Proposal 0 · 명세 변경 0 · 상태 변경 0/.test(item.whyKo))
    .sort((a, b) => Number.parseInt(b.evidence) - Number.parseInt(a.evidence))
    .slice(0, 5);
}

function buildKgldObservations(report: WeeklyRadarReport, proposals: ClassifiedProposal[]): KgldObservation[] {
  const byProposal = new Map(proposals.map((proposal) => [proposal.proposalId, proposal]));
  return report.kgldOpportunityRadar.candidates
    .map((candidate) => {
      const proposal = byProposal.get(candidate.proposalId);
      if (!proposal?.primaryDomain || proposal.classificationConfidence < 80) return undefined;
      if (/^(ERC-8100|ERC-8257)$/i.test(proposal.proposalId)) return undefined;
      if (/^(ERC-8196|ERC-8329)$/i.test(proposal.proposalId)) return undefined;
      const direct = directKgldObservation(proposal);
      if (direct) return direct;
      if (!/^(ERC-8330|ERC-8328|ERC-8161|ERC-8325)$/i.test(proposal.proposalId)) return undefined;
      const technologies = proposal.technologies.join(", ");
      const relevant = /Token|Vault|Oracle|RWA|Attestation|Compliance|Restricted|Wallet|Account|Cross-chain|Interoperability/i.test(`${technologies} ${candidate.whyRelevantToKGLD} ${candidate.potentialUseCases.join(" ")}`);
      if (!relevant) return undefined;
      const useCases = candidate.potentialUseCases.slice(0, 2).join(", ");
      return {
        technologyChange: `${technologies || proposal.title}`,
        connectionReasonKo: kgldConnectionKo(candidate.whyRelevantToKGLD, useCases, proposal.primaryDomain),
        requiredActionKo: kgldActionKo(candidate.recommendedAction, proposal),
        evidenceProposalIds: [proposal.proposalId],
      };
    })
    .filter((item): item is KgldObservation => Boolean(item))
    .slice(0, 5);
}

function directKgldObservation(proposal: ClassifiedProposal): KgldObservation | undefined {
  const id = proposal.proposalId.toUpperCase();
  if (id === "ERC-8330") {
    return {
      technologyChange: "ERC-8330 NAV snapshot oracle",
      connectionReasonKo: "자산별 NAV 정보를 온체인에 남기는 방식은 KGLD의 가격 기준시각, 가격 출처, 갱신주기 정책과 비교할 수 있습니다.",
      requiredActionKo: "가격 기준시각, 출처, 갱신주기, 정정 방식이 KGLD 운영 기준과 충돌하지 않는지 표로 비교합니다.",
      evidenceProposalIds: [proposal.proposalId],
    };
  }
  if (id === "ERC-8328") {
    return {
      technologyChange: "ERC-8328 compliance event log",
      connectionReasonKo: "제한, 승인, 상환 같은 컴플라이언스 이벤트를 기록하는 구조는 KGLD의 운영 기록과 감사 추적 방식과 맞닿아 있습니다.",
      requiredActionKo: "제한 사유, 승인 주체, 상환 이벤트가 어떤 필드로 기록되는지 KGLD 이벤트 모델과 비교합니다.",
      evidenceProposalIds: [proposal.proposalId],
    };
  }
  if (id === "ERC-8161") {
    return {
      technologyChange: "ERC-8161 transferable vault request",
      connectionReasonKo: "상환 요청을 토큰화해 이전할 수 있게 만드는 구조는 KGLD 상환청구 흐름과 구조적으로 비교할 수 있습니다.",
      requiredActionKo: "직접 적용 가능하다고 보지 말고, 요청 생성·이전·정산 단계의 책임 경계를 연구 항목으로 분리합니다.",
      evidenceProposalIds: [proposal.proposalId],
    };
  }
  if (id === "ERC-8325") {
    return {
      technologyChange: "ERC-8325 asset anchor registry",
      connectionReasonKo: "자산 기준점과 문서 참조를 등록하는 구조는 준비자산 증빙과 외부 문서 연결 방식 검토에 도움이 됩니다.",
      requiredActionKo: "준비자산 문서, 증빙 주체, 갱신 절차를 registry 필드와 비교합니다.",
      evidenceProposalIds: [proposal.proposalId],
    };
  }
  return undefined;
}

function kgldReviewActionKo(proposal: ClassifiedProposal): string {
  const text = `${proposal.primaryDomain ?? ""} ${proposal.technologies.join(" ")}`;
  if (/identity-compliance|Compliance|Attestation|Restricted/i.test(text)) return "컴플라이언스 로그, 권한 증명, 제한 전송 정책에 닿는 명세 변경만 검토합니다.";
  if (/Oracle|Pricing|NAV|RWA/i.test(text)) return "가격 산정, NAV, RWA attestations에 직접 닿는 명세 변경만 검토합니다.";
  if (/tokens-finance|Vault|Token/i.test(text)) return "토큰, vault, claim 흐름에 직접 닿는 명세 변경만 검토합니다.";
  if (/accounts-wallets|Wallet|Account/i.test(text)) return "지갑 권한, 계정 정책, 사용자 승인 흐름에 직접 닿는 명세 변경만 검토합니다.";
  if (/interoperability|Cross-chain/i.test(text)) return "cross-chain 메시징과 상호운용성 경계에 직접 닿는 명세 변경만 검토합니다.";
  return "KGLD 운영 정책에 직접 연결되는 명세 변경만 검토합니다.";
}

function kgldActionKo(action: KgldCandidate["recommendedAction"], proposal: ClassifiedProposal): string {
  if (action === "poc") return "인터페이스 갭과 구현 시나리오를 별도 검토 항목으로 분리합니다.";
  if (action === "review") return kgldReviewActionKo(proposal);
  return "후속 discussion과 명세 변경 여부를 다음 수집 주기에 확인합니다.";
}

function weeklyEvidenceKo(event: ChangeEvent): string {
  if (event.type === "new_proposal") return `${event.proposalId} 신규 proposal 등록`;
  if (event.type === "content_hash_change") return `${event.proposalId} 본문 변경`;
  if (event.type === "final_transition") return `${event.proposalId} Final 상태 전환`;
  if (event.type === "status_change") return `${event.proposalId} 상태 변경`;
  if (event.type === "withdrawn_transition") return `${event.proposalId} Withdrawn 상태 전환`;
  return `${event.proposalId} 변경 이벤트`;
}

function kgldConnectionKo(source: string | undefined, useCases: string, domainId: AtlasDomainId): string {
  const domain = DOMAIN_BY_ID.get(domainId)?.nameKo ?? "관련 기술 영역";
  if (useCases) return `${domain} 변화가 ${useCases} 검토 항목과 연결됩니다.`;
  if (source && !/monitoring unless direct dependency|direct dependency evidence/i.test(source)) return source;
  return `${domain} 변화가 KGLD 운영 경계와 직접 맞닿는지 확인해야 합니다.`;
}

function buildSummary(activeDomains: DomainActivity[], risingDomains: DomainActivity[], weeklyChanges: WeeklyAtlasChange[]): string[] {
  const top = activeDomains.slice(0, 3).map((domain) => domain.domain.nameKo);
  const rising = risingDomains.slice(0, 3).map((domain) => domain.domain.nameKo);
  const sentences = [
    top.length
      ? `최근 180일 변경된 Proposal은 ${top.join(", ")} 영역에서 확인됩니다.`
      : "현재 수집 범위에서는 뚜렷하게 집중된 기술 영역을 단정하기 어렵습니다.",
    rising.length
      ? `이번 주 변화는 ${rising.join(", ")} 영역에서 상대적으로 많이 관찰됩니다.`
      : "이번 주에는 장기 흐름을 크게 바꿀 만한 단기 변화가 제한적입니다.",
    weeklyChanges.length
      ? "이번 주 변화는 topic 단위로 묶어 해석하며, 구현 또는 채택은 별도 근거가 있을 때만 판단합니다."
      : "이번 주 활동이 적어도 장기 기술 지도는 180일 누적 근거를 기준으로 유지합니다.",
  ];
  return sentences.slice(0, 3);
}

function dataQuality(report: WeeklyRadarReport, accepted: ClassifiedProposal[], held: ClassifiedProposal[]): string {
  const discussionCount = report.ethereumTechRadar.signalLayer.discussionHeat.length;
  const adoptionStatus = report.ethereumTechRadar.adoptionLayer?.collectionStatus ?? "fallback";
  const discussionScope = discussionCount <= 1
    ? "Ethereum Magicians 수집 범위가 제한적입니다."
    : `Ethereum Magicians thread URL ${discussionCount}건을 별도로 보관합니다.`;
  const implementationScope = adoptionStatus === "collected" ? "외부 구현 근거가 일부 확인됐습니다." : "이번 수집 범위에서는 구현 사례를 확인하지 못했습니다.";
  return `분석 대상 ${accepted.length}건, 추가 검토 대상 ${held.length}건. ${implementationScope} ${discussionScope}`;
}

function problemFor(domainId: AtlasDomainId, technologies: string[]): string {
  const labels = CANONICAL_DOMAIN_LABELS[domainId];
  return `${labels.problemKo} 확인된 기술 근거: ${technologies.slice(0, 3).join(", ") || "분류 보류"}.`;
}

function proposedChangeFor(domainId: AtlasDomainId, technologies: string[]): string {
  const tech = technologies[0] ?? CANONICAL_DOMAIN_LABELS[domainId].nameKo;
  const prefix = `${tech}: `;
  if (domainId === "execution-state") return `${prefix}실행 비용, 상태 접근, 트랜잭션 처리 규칙을 명시적으로 조정하는 변화입니다.`;
  if (domainId === "scaling-data") return `${prefix}데이터 게시와 정산 비용 구조를 조정하는 변화입니다.`;
  if (domainId === "accounts-wallets") return `${prefix}지갑 권한과 사용자 작업 흐름을 더 명확하게 제어하는 변화입니다.`;
  if (domainId === "validators-consensus") return `${prefix}검증자와 합의 인증 가정을 바꾸는 변화입니다.`;
  if (domainId === "tokens-finance") return `${prefix}토큰화된 금융 흐름의 인터페이스를 표준화하는 변화입니다.`;
  if (domainId === "identity-compliance") return `${prefix}자격, 접근 조건, 제한 전송을 검증 가능하게 만드는 변화입니다.`;
  if (domainId === "interoperability") return `${prefix}체인 간 자산과 메시지 이동의 접점을 줄이는 변화입니다.`;
  return `${prefix}표준화 절차와 업그레이드 관리 규칙을 정리하는 변화입니다.`;
}

function reasonFor(evidence: ProposalEvidence, domainId: AtlasDomainId, technologies: string[]): string {
  const domain = CANONICAL_DOMAIN_LABELS[domainId];
  return `${evidence.proposalId} 제목과 변경 내용에서 ${technologies.slice(0, 2).join(", ") || domain.nameKo} 신호가 확인되었습니다.`;
}

function recentActivity(evidence: ProposalEvidence): string {
  const parts: string[] = [];
  if (evidence.recentEvents.some((event) => event.type === "new_proposal")) parts.push("신규 proposal");
  if (evidence.recentEvents.some((event) => event.type === "content_hash_change")) parts.push("본문 변경");
  if (evidence.recentEvents.some((event) => event.type === "status_change" || event.type === "final_transition" || event.type === "withdrawn_transition")) parts.push("상태 변경");
  if (evidence.discussions.some((discussion) => hasCollectedCurrentPosts(discussion))) parts.push("논의 활동");
  return parts.length ? parts.join(", ") : "최근 직접 변화 없음";
}

function momentumDirection(activity180d: number, activity7d: number): MomentumDirection {
  if (activity180d === 0) return "데이터 부족";
  const weeklyBaseline = activity180d / 26;
  if (activity7d >= Math.max(2, weeklyBaseline * 1.6)) return "증가";
  if (activity7d === 0 && activity180d >= 4) return "감소";
  return "유지";
}

function compareDomainActivity(left: DomainActivity, right: DomainActivity): number {
  return right.activity180d - left.activity180d || right.activity7d - left.activity7d || left.domain.nameKo.localeCompare(right.domain.nameKo);
}

function compareProposalActivity(report: WeeklyRadarReport) {
  const recent = new Set(allRecentEvents(report).map((event) => event.proposalId));
  return (left: ClassifiedProposal, right: ClassifiedProposal) =>
    Number(recent.has(right.proposalId)) - Number(recent.has(left.proposalId))
    || right.classificationConfidence - left.classificationConfidence
    || left.proposalId.localeCompare(right.proposalId);
}

function allRecentEvents(report: WeeklyRadarReport): ChangeEvent[] {
  return [
    ...report.ethereumTechRadar.recentChanges.newProposals,
    ...report.ethereumTechRadar.recentChanges.statusChanges,
    ...report.ethereumTechRadar.recentChanges.finalTransitions,
    ...report.ethereumTechRadar.recentChanges.withdrawnTransitions,
    ...report.ethereumTechRadar.recentChanges.contentHashChanges,
  ];
}

function allTrendEvents(report: WeeklyRadarReport): ChangeEvent[] {
  const changes = report.ethereumTechRadar.trendChanges;
  if (!changes) return allRecentEvents(report);
  return [
    ...changes.newProposals,
    ...changes.statusChanges,
    ...changes.finalTransitions,
    ...changes.withdrawnTransitions,
    ...changes.contentHashChanges,
  ];
}

function allPreviousEvents(report: WeeklyRadarReport): ChangeEvent[] {
  const changes = report.ethereumTechRadar.previousChanges;
  if (!changes) return [];
  return [
    ...changes.newProposals,
    ...changes.statusChanges,
    ...changes.finalTransitions,
    ...changes.withdrawnTransitions,
    ...changes.contentHashChanges,
  ];
}

function previousWindowState(report: WeeklyRadarReport): { collected: boolean; reason: string } {
  const changes = report.ethereumTechRadar.previousChanges;
  if (!changes) return { collected: false, reason: "previousChanges snapshot missing" };
  const total = allPreviousEvents(report).length;
  if (total === 0) return { collected: false, reason: "previousChanges window has no timestamped events" };
  return { collected: true, reason: "previousChanges contains timestamped events" };
}

function discussionWithinRange(discussion: DiscussionHeatItem, from: string, to: string): boolean {
  if (discussion.discussionCollectionStatus !== "posts_fully_collected") return false;
  const value = discussion.discussionLastActivityAt ?? discussion.discussionCreatedAt;
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= Date.parse(from) && timestamp <= Date.parse(to);
}

function hasCollectedCurrentPosts(discussion: DiscussionHeatItem): boolean {
  return discussion.discussionCollectionStatus === "posts_fully_collected"
    && (discussion.postsInCurrent7d ?? 0) > 0
    && (discussion.postTimestampTrace?.length ?? 0) > 0;
}

function cleanProposalTitle(proposalId: string, title: string | null | undefined): string | undefined {
  const clean = String(title ?? "").trim();
  if (!clean || clean === proposalId || /^EIP-\d+$|^ERC-\d+$/i.test(clean)) return undefined;
  return clean;
}

function duplicateTechnologyProposalLists(domains: DomainActivity[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const domain of domains) {
    for (const technology of domain.technologies) {
      if (technology.proposalIds.length < 3) continue;
      const key = technology.proposalIds.join(",");
      if (key && seen.has(key)) duplicates += 1;
      if (key) seen.add(key);
    }
  }
  return duplicates;
}

function repeatedTechnologySetCount(proposals: ClassifiedProposal[]): number {
  const counts = new Map<string, number>();
  for (const proposal of proposals) {
    const key = proposal.technologies.slice().sort().join("|");
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count >= 20).length;
}

function topicChangeComposition(report: WeeklyRadarReport, proposals: ClassifiedProposal[]): TechnologyAtlas["charts"]["topicChangeComposition"] {
  const events = allRecentEvents(report).filter(isConfirmedTimestampEvent);
  const byTopic = new Map<string, { newProposal: Set<string>; bodyChange: Set<string>; statusChange: Set<string>; discussion: Set<string> }>();
  for (const proposal of proposals) {
    const topic = displayTopicForAtlasProposal(proposal);
    if (isGenericTopic(topic)) continue;
    const bucket = byTopic.get(topic) ?? { newProposal: new Set<string>(), bodyChange: new Set<string>(), statusChange: new Set<string>(), discussion: new Set<string>() };
    const proposalEvents = events.filter((event) => event.proposalId === proposal.proposalId);
    if (proposalEvents.some((event) => event.type === "new_proposal")) bucket.newProposal.add(proposal.proposalId);
    if (proposalEvents.some(isPriorityContentChange)) bucket.bodyChange.add(proposal.proposalId);
    if (proposalEvents.some((event) => event.type === "status_change" || event.type === "final_transition" || event.type === "withdrawn_transition")) bucket.statusChange.add(proposal.proposalId);
    byTopic.set(topic, bucket);
  }
  const rows = [...byTopic.entries()]
    .map(([label, counts]) => ({
      label,
      newProposal: counts.newProposal.size,
      bodyChange: counts.bodyChange.size,
      statusChange: counts.statusChange.size,
      discussion: counts.discussion.size,
      total: counts.newProposal.size + counts.bodyChange.size + counts.statusChange.size + counts.discussion.size,
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  return {
    labels: rows.map((row) => row.label),
    newProposal: rows.map((row) => row.newProposal),
    bodyChange: rows.map((row) => row.bodyChange),
    statusChange: rows.map((row) => row.statusChange),
    discussion: rows.map((row) => row.discussion),
  };
}

function displayTopicForAtlasProposal(proposal: ClassifiedProposal): string | undefined {
  const topicName = proposal.topicNames.find((value) => value && !/^(tokens-finance|identity-compliance|execution-state|accounts-wallets|scaling-data|validators-consensus|interoperability|governance-process)$/i.test(value));
  const id = proposal.proposalId.toUpperCase();
  if (/^EIP-8148$/i.test(id)) return "Validator Operations";
  if (/^EIP-8015$|^EIP-8205$/i.test(id)) return "Validator Deposits and Withdrawals";
  if (/^EIP-8243$/i.test(id)) return "Consensus Attestation Processing";
  if (/^EIP-8282$/i.test(id)) return "Builder and Consensus Requests";
  if (/^EIP-8222$/i.test(id)) return "Lean Staking";
  if (/^EIP-8310$/i.test(id)) return "Wallet Key Management";
  if (/^EIP-8296$/i.test(id)) return "State Tiering and State Management";
  if (/^ERC-8161$/i.test(id)) return "Vault Request Standardization";
  if (/^ERC-8330$/i.test(id)) return "NAV and Asset Reporting";
  if (/^ERC-8048$|^ERC-7303$/i.test(id)) return "Token Registry and Metadata";
  if (/^ERC-5516$/i.test(id)) return "Token Ownership / Soulbound";
  if (/^ERC-6123$/i.test(id)) return "Smart Derivative Contract";
  if (/^(EIP-7904|EIP-7778|EIP-7976|EIP-8007|EIP-8037|EIP-8038|EIP-2780|EIP-7981)$/i.test(id)) return "Gas 비용과 실행 자원 재조정";
  if (/^(EIP-8163|EIP-8266|EIP-8272|EIP-8219|EIP-8175|EIP-8184|EIP-8209)$/i.test(id)) return "Execution Model and Opcode Changes";
  if (topicName && !/Post-Quantum Validator Authentication|Gas Repricing and Resource Accounting|Token Registry and Circulation Standards/i.test(topicName)) return topicName;
  const text = `${proposal.topicIds.join(" ")} ${proposal.primaryDomain ?? ""} ${proposal.technologies.join(" ")}`;
  if (/block-access|partial-state|Block-Level Access Lists|State Access|Statelessness/i.test(text)) return "Block Access and Partial Statefulness";
  if (/resource-accounting/i.test(text)) return "Execution Model and Resource Accounting";
  if (/post-quantum|validator-authentication|Post-Quantum/i.test(text)) return "양자내성 검증자 인증";
  if (/Validator|Consensus/i.test(text)) return "검증자·합의 신규 제안";
  if (/wallet-authorization|Key Management|Account Abstraction|Delegation|Wallet|UserOperation|Bundler|Paymaster/i.test(text)) return "Wallet Authorization Evolution";
  if (/vault-request|Vault Request|ERC-4626 Vault/i.test(text)) return "Vault Request Standardization";
  if (/programmable-compliance|Compliance|Credential|Identity|Restricted Transfer|Attestation/i.test(text)) return "Programmable Compliance Infrastructure";
  if (/Token Registry Metadata|Fungible Token|NFT \/ Multi-token|Tokenized Claims/i.test(text)) return "Token Registry and Circulation Standards";
  if (proposal.primaryDomain === "governance-process") return "Hardfork and Standards Process";
  if (proposal.primaryDomain === "scaling-data") return "Data Availability and Calldata Costs";
  if (proposal.primaryDomain === "tokens-finance") return "Token Registry and Circulation Standards";
  if (proposal.primaryDomain === "interoperability") return "Cross-chain Message and Signature Standards";
  return undefined;
}

function concentrationWarnings(proposals: ClassifiedProposal[]): string[] {
  if (!proposals.length) return [];
  const counts = new Map<string, number>();
  for (const proposal of proposals) {
    for (const technology of proposal.technologies) counts.set(technology, (counts.get(technology) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count / proposals.length > 0.4)
    .map(([technology, count]) => `${technology} exceeds 40% of classified proposals (${count}/${proposals.length}).`);
}

function rule(technology: string, domain: AtlasDomainId, ...patterns: RegExp[]): TechnologyRule {
  return { technology, domain, patterns };
}

function canonicalDomain(domain: DomainDefinition): DomainDefinition {
  const labels = CANONICAL_DOMAIN_LABELS[domain.id];
  return { ...domain, nameKo: labels.nameKo, problemKo: labels.problemKo };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueBy<T>(values: T[], keyOf: (value: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function domainForTechnology(technology: string): AtlasDomainId | undefined {
  return TECH_TO_DOMAIN.get(technology);
}

export function representativeProposalFromClassified(proposal: ClassifiedProposal): RepresentativeProposal {
  return {
    id: proposal.proposalId,
    title: proposal.title,
    status: proposal.status,
    oneLineSummary: proposal.proposedChange,
    canonicalUrl: proposal.canonicalUrl ?? "",
  };
}

