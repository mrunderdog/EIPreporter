import type {
  AccountAbstractionRadar,
  ChangeEvent,
  CountByLabel,
  DominantSubTrend,
  ProposalRecord,
  ProposalThemeAnalysis,
  ThemeInsight,
  ThemeName,
} from "./types.ts";

type Rule = {
  name: string;
  keywords: string[];
  description: string;
};

const THEME_RULES: Array<{ theme: ThemeName; keywords: string[] }> = [
  { theme: "Network Upgrade / Governance", keywords: ["hardfork", "hard fork", "meta", "bpo", "fork", "network upgrade"] },
  { theme: "Block / Validator Operations", keywords: ["block access list", "block access list exchange", "validator operations", "validator", "block builder"] },
  { theme: "Account Abstraction", keywords: ["account abstraction", "erc-4337", "user operation", "userop", "bundler", "paymaster", "smart account", "modular account", "erc-7579", "erc-6900", "session key", "delegation", "passkey", "webauthn", "erc-1271", "signature validation"] },
  { theme: "Wallet UX", keywords: ["wallet", "account recovery", "social recovery", "authenticated wallet", "batched transaction", "batch transaction", "intent", "gasless", "sponsor"] },
  { theme: "Smart Account", keywords: ["smart account", "contract account", "modular account", "erc-7579", "erc-6900", "account module"] },
  { theme: "Gasless / Paymaster", keywords: ["gasless", "paymaster", "gas sponsorship", "sponsored transaction", "fee sponsor"] },
  { theme: "Session Key / Delegation", keywords: ["session key", "delegation", "delegate permission", "delegated permission", "limited permission"] },
  { theme: "Passkey / WebAuthn", keywords: ["passkey", "webauthn", "p-256", "secp256r1"] },
  { theme: "Token Standard", keywords: ["token standard", "erc-20", "erc-721", "erc-1155", "tokenized", "token interface", "multi token"] },
  { theme: "DeFi / Vault", keywords: ["defi", "vault", "erc-4626", "yield", "collateral", "liquidity", "redemption"] },
  { theme: "Oracle / Pricing", keywords: ["oracle", "price feed", "pricing", "twap", "valuation"] },
  { theme: "RWA / Attestation", keywords: ["rwa", "real world asset", "attestation", "proof of reserve", "asset-backed", "custody proof", "redemption proof"] },
  { theme: "Identity / Credential", keywords: ["identity", "credential", "verifiable credential", "kyc", "claim", "authority", "binding", "recovery"] },
  { theme: "Compliance / Restricted Transfer", keywords: ["compliance", "restricted transfer", "transfer restriction", "allowlist", "whitelist", "sanction"] },
  { theme: "Cross-chain / Bridge", keywords: ["cross-chain", "cross chain", "bridge", "interoperab", "canonical asset", "message passing"] },
  { theme: "Signature / Security", keywords: ["signature", "erc-1271", "replay protection", "authorization", "authentication", "security"] },
  { theme: "Transaction Model / Execution", keywords: ["frame transaction", "transaction frame", "transaction envelope", "transaction structure", "transaction semantics", "execution frame", "call frame", "tx frame"] },
  { theme: "EVM / Gas / Opcode", keywords: ["evm", "opcode", "gas cost", "gas pricing", "precompile", "execution layer", "kzg", "extension"] },
  { theme: "Rollup / L2", keywords: ["rollup", "layer 2", "layer2", "l2", "optimistic", "zk-rollup", "sequencer"] },
  { theme: "Data Availability", keywords: ["data availability", "blob", "bib", "block-in-blobs", "block in blobs", "danksharding", "data gas", "calldata"] },
  { theme: "NFT / Gaming", keywords: ["nft", "gaming", "game", "metaverse", "erc-721", "erc-1155"] },
  { theme: "Governance / Process", keywords: ["governance", "voting", "proposal process", "eip process", "erc process", "meta eip"] },
];

const SUB_TREND_RULES: Partial<Record<ThemeName, Rule[]>> = {
  "Account Abstraction": [
    rule("Smart account modularization", ["modular account", "erc-7579", "erc-6900", "account module"], "스마트 계정 기능을 모듈 단위로 조합하고 교체하려는 접근입니다."),
    rule("Paymaster / gas sponsorship", ["paymaster", "gas sponsorship", "gasless", "sponsored transaction"], "사용자 가스비를 서비스 또는 토큰 결제 흐름으로 흡수하려는 접근입니다."),
    rule("Session key / delegated permission", ["session key", "delegation", "delegated permission", "limited permission"], "기간과 범위가 제한된 권한으로 반복 서명 부담을 줄이는 접근입니다."),
    rule("Passkey / WebAuthn authentication", ["passkey", "webauthn", "p-256", "secp256r1"], "기기 기반 패스키 인증을 온체인 계정 인증과 연결하는 접근입니다."),
    rule("Signature validation / ERC-1271", ["erc-1271", "signature validation", "contract signature"], "컨트랙트 계정의 서명 검증 방식을 표준화하는 접근입니다."),
    rule("Bundler / user operation infrastructure", ["bundler", "user operation", "userop", "erc-4337"], "UserOperation 수집, 검증, 실행 인프라를 표준화하는 접근입니다."),
  ],
  "Wallet UX": [
    rule("Transaction batching", ["batch transaction", "batched transaction", "multicall"], "여러 사용자 작업을 한 번의 승인과 실행으로 묶는 접근입니다."),
    rule("Recovery and permission UX", ["recovery", "permission", "delegation"], "복구와 권한 관리를 일반 사용자에게 단순하게 노출하려는 접근입니다."),
    rule("Intent-based execution", ["intent", "solver"], "사용자가 결과를 선언하고 실행 경로는 인프라가 선택하는 접근입니다."),
  ],
  "Smart Account": [
    rule("Modular account architecture", ["modular account", "erc-7579", "erc-6900", "account module"], "검증, 실행, 복구 기능을 교체 가능한 계정 모듈로 구성하는 접근입니다."),
    rule("Programmable validation", ["validation", "validator", "erc-1271"], "계정별 서명과 권한 검증 정책을 프로그래밍 가능하게 만드는 접근입니다."),
    rule("Account recovery", ["recovery", "guardian", "social recovery"], "키 분실 시 계정 권한을 안전하게 복구하는 접근입니다."),
  ],
  "Gasless / Paymaster": [
    rule("Sponsored gas policy", ["paymaster", "gas sponsorship", "sponsored transaction"], "서비스가 조건부로 사용자 가스비를 대납하는 정책 접근입니다."),
    rule("Token-denominated fees", ["token fee", "fee token", "erc-20 gas"], "사용자가 보유한 토큰으로 수수료를 정산하는 접근입니다."),
  ],
  "Session Key / Delegation": [
    rule("Time-bound session permission", ["session key", "time-bound", "expiry"], "기간이 제한된 세션 권한으로 반복 서명을 줄이는 접근입니다."),
    rule("Scoped delegation", ["delegation", "limited permission", "permission scope"], "대상 컨트랙트와 함수별로 위임 범위를 제한하는 접근입니다."),
  ],
  "Passkey / WebAuthn": [
    rule("P-256 signature verification", ["p-256", "secp256r1", "webauthn"], "WebAuthn 기기의 P-256 서명을 온체인에서 검증하는 접근입니다."),
    rule("Device-bound account authentication", ["passkey", "device", "authenticator"], "기기 보안 영역의 패스키를 스마트 계정 인증과 연결하는 접근입니다."),
  ],
  "Token Standard": [
    rule("Fungible token extension", ["erc-20", "fungible"], "대체 가능 토큰의 전송, 승인, 권한 기능을 확장하는 접근입니다."),
    rule("NFT and multi-token interface", ["erc-721", "erc-1155", "nft", "multi token"], "NFT와 멀티토큰 소유권 및 전송 인터페이스를 확장하는 접근입니다."),
    rule("Tokenized claim representation", ["tokenized", "claim", "asset-backed"], "권리나 자산 청구권을 표준 토큰 인터페이스로 표현하는 접근입니다."),
  ],
  "DeFi / Vault": [
    rule("ERC-4626 vault extension", ["erc-4626", "vault extension", "tokenized vault"], "ERC-4626 기반 금고의 기능과 상호운용성을 확장하는 접근입니다."),
    rule("Collateralization", ["collateral", "collateralization"], "자산을 담보로 설정하고 위험 조건을 표준화하는 접근입니다."),
    rule("Yield strategy standardization", ["yield strategy", "yield", "strategy"], "수익 전략의 인터페이스와 이용 방식을 표준화하는 접근입니다."),
    rule("Oracle-based pricing", ["oracle", "price feed", "pricing", "valuation"], "외부 가격을 금고 평가와 위험 관리에 연결하는 접근입니다."),
    rule("Liquidity and redemption flow", ["liquidity", "redeem", "redemption", "withdraw"], "유동성 공급과 상환 흐름의 예측 가능성을 높이는 접근입니다."),
  ],
  "Oracle / Pricing": [
    rule("On-chain price feed", ["price feed", "oracle"], "외부 가격 정보를 검증 가능한 온체인 피드로 제공하는 접근입니다."),
    rule("Time-weighted pricing", ["twap", "time-weighted"], "단기 가격 조작을 줄이기 위해 시간가중 가격을 사용하는 접근입니다."),
    rule("Asset valuation interface", ["valuation", "pricing"], "담보와 토큰의 평가 방식을 공통 인터페이스로 정의하는 접근입니다."),
  ],
  "RWA / Attestation": [
    rule("Proof of reserve", ["proof of reserve", "reserve proof"], "준비자산의 존재와 충분성을 검증 가능하게 표현하는 접근입니다."),
    rule("Credential-based access", ["credential", "kyc", "identity"], "검증된 자격 정보를 자산 접근 및 거래 조건에 연결하는 접근입니다."),
    rule("Asset-backed claim representation", ["asset-backed", "backed claim", "real world asset", "rwa"], "실물자산에 대한 권리와 청구권을 토큰 형태로 표현하는 접근입니다."),
    rule("Compliance proof", ["compliance proof", "compliance", "restricted transfer"], "규제 조건 충족 여부를 검증 가능한 증명으로 전달하는 접근입니다."),
    rule("Custody or redemption proof", ["custody proof", "redemption proof", "custody", "redemption"], "보관 및 상환 과정의 상태를 검증 가능하게 연결하는 접근입니다."),
  ],
  "Identity / Credential": [
    rule("Verifiable credential", ["verifiable credential", "credential"], "검증 가능한 자격 정보를 계정과 거래 조건에 연결하는 접근입니다."),
    rule("On-chain identity binding", ["identity binding", "identity", "account binding"], "계정과 주체 식별정보의 연결 방식을 표준화하는 접근입니다."),
    rule("Selective access claim", ["claim", "kyc", "access"], "필요한 자격 조건만 확인하도록 접근을 제한하는 방식입니다."),
  ],
  "Compliance / Restricted Transfer": [
    rule("Transfer restriction hook", ["restricted transfer", "transfer restriction", "transfer hook"], "토큰 전송 시 규제 조건을 검사하는 훅을 적용하는 접근입니다."),
    rule("Allowlist-based eligibility", ["allowlist", "whitelist", "eligibility"], "사전 검증된 주소나 자격 기준으로 거래를 제한하는 접근입니다."),
    rule("Compliance proof verification", ["compliance proof", "sanction", "compliance"], "규제 준수 여부를 증명하고 검증하는 접근입니다."),
  ],
  "Cross-chain / Bridge": [
    rule("Bridge messaging", ["bridge message", "message passing", "messaging"], "체인 간 메시지 전달 형식과 실행 절차를 표준화하는 접근입니다."),
    rule("Canonical asset representation", ["canonical asset", "canonical token", "asset representation"], "여러 체인에서 동일 자산의 기준 표현을 정하는 접근입니다."),
    rule("Interoperable token movement", ["interoperab", "token movement", "cross-chain token"], "토큰 이동 인터페이스를 체인 간에 일관되게 만드는 접근입니다."),
    rule("Cross-chain verification", ["cross-chain verification", "light client", "proof verification"], "다른 체인의 상태와 메시지를 검증하는 접근입니다."),
    rule("Replay protection", ["replay protection", "replay"], "체인 간 메시지와 서명의 중복 실행을 방지하는 접근입니다."),
  ],
  "Signature / Security": [
    rule("Contract signature validation", ["erc-1271", "signature validation", "contract signature"], "컨트랙트 계정의 서명 검증 인터페이스를 표준화하는 접근입니다."),
    rule("Replay-resistant authorization", ["replay protection", "nonce", "domain separator"], "서명과 권한의 중복 실행을 방지하는 접근입니다."),
    rule("Scoped authorization", ["authorization", "permission", "scope"], "서명이 허용하는 작업과 대상을 명시적으로 제한하는 접근입니다."),
  ],
  "EVM / Gas / Opcode": [
    rule("Opcode extension", ["opcode", "instruction"], "EVM 실행 명령을 추가하거나 기존 명령 의미를 확장하는 접근입니다."),
    rule("Gas repricing", ["gas cost", "gas pricing", "repricing"], "실제 자원 비용에 맞춰 연산과 저장 비용을 조정하는 접근입니다."),
    rule("Native precompile", ["precompile", "native contract"], "빈번한 암호 및 계산 기능을 네이티브 실행 경로로 제공하는 접근입니다."),
    rule("Execution semantics", ["evm", "execution layer", "execution semantics"], "EVM 실행 규칙과 상태 전이 조건을 정교화하는 접근입니다."),
  ],
  "Transaction Model / Execution": [
    rule("Transaction framing", ["frame transaction", "transaction frame", "execution frame", "call frame", "tx frame"], "Defines a more explicit transaction execution structure or boundary."),
    rule("Transaction semantics", ["transaction envelope", "transaction structure", "transaction semantics"], "Clarifies transaction structure, envelope, or execution semantics."),
  ],
  "Rollup / L2": [
    rule("Sequencer decentralization", ["sequencer", "based rollup"], "트랜잭션 순서 결정 권한을 분산하는 접근입니다."),
    rule("Rollup proof system", ["fraud proof", "validity proof", "zk-rollup"], "L2 상태 전이의 정확성을 증명하는 접근입니다."),
    rule("L1-L2 interoperability", ["l1", "l2", "bridge", "interoperab"], "L1과 L2 사이 메시지와 자산 이동을 표준화하는 접근입니다."),
  ],
  "Data Availability": [
    rule("Blob data scaling", ["blob", "data gas"], "롤업 데이터 게시를 별도 데이터 가용성 시장으로 확장하는 접근입니다."),
    rule("Danksharding path", ["danksharding", "data availability sampling"], "샤딩과 샘플링을 통해 데이터 가용성 용량을 확대하는 접근입니다."),
    rule("Calldata efficiency", ["calldata", "compression"], "게시 데이터의 크기와 비용을 줄이는 접근입니다."),
  ],
  "NFT / Gaming": [
    rule("Composable NFT interface", ["composable", "erc-721", "nft"], "NFT 소유권과 기능을 다른 자산 및 애플리케이션과 조합하는 접근입니다."),
    rule("Multi-token game asset", ["erc-1155", "multi token", "game asset"], "게임 내 다양한 자산 유형을 하나의 인터페이스로 관리하는 접근입니다."),
    rule("NFT identity or entitlement", ["identity", "entitlement", "membership"], "NFT를 신원, 멤버십, 사용 권리 표현에 활용하는 접근입니다."),
  ],
  "Governance / Process": [
    rule("Proposal lifecycle process", ["proposal process", "eip process", "erc process"], "제안 작성부터 검토와 확정까지의 절차를 개선하는 접근입니다."),
    rule("On-chain voting", ["voting", "vote", "governance"], "의사결정 권한과 투표 결과를 온체인 규칙으로 표현하는 접근입니다."),
    rule("Delegated governance", ["governance delegation", "delegate"], "투표 권한을 전문 참여자에게 위임하는 접근입니다."),
  ],
};

export const THEME_NAMES = THEME_RULES.map((item) => item.theme);

export function analyzeProposal(record: ProposalRecord): ProposalThemeAnalysis {
  const text = searchableText(record);
  const themes = THEME_RULES
    .filter((item) => item.keywords.some((keyword) => text.includes(keyword)))
    .map((item) => item.theme);
  const subTrendsByTheme: ProposalThemeAnalysis["subTrendsByTheme"] = {};

  for (const theme of themes) {
    const matches = (SUB_TREND_RULES[theme] ?? [])
      .filter((item) => item.keywords.some((keyword) => text.includes(keyword)))
      .map((item) => item.name);
    if (matches.length > 0) subTrendsByTheme[theme] = matches;
  }

  return {
    proposal: record,
    themes,
    subTrendsByTheme,
    oneLineSummary: buildOneLineSummary(record, themes[0]),
  };
}

export function buildOneLineSummary(record: ProposalRecord, theme?: ThemeName): string {
  const description = record.description?.replace(/\s+/g, " ").trim();
  if (description && /[가-힣]/.test(description)) return limitSentence(description);
  const title = record.title?.trim() || record.proposalId;
  return `${theme ?? "Ethereum/EVM 기술"} 관련 표준 제안으로, ${title} 문제를 다룹니다.`;
}

export function buildThemeInsights(
  analyses: ProposalThemeAnalysis[],
  recentEvents: ChangeEvent[],
  kgldCandidateIds: Set<string> = new Set(),
): ThemeInsight[] {
  const maxProposalCount = Math.max(1, ...THEME_NAMES.map((theme) =>
    analyses.filter((analysis) => analysis.themes.includes(theme)).length
  ));
  const eventCountsByProposal = countRecentEventsByProposal(recentEvents);
  const maxRecentChangeCount = Math.max(1, ...THEME_NAMES.map((theme) =>
    analyses
      .filter((analysis) => analysis.themes.includes(theme))
      .reduce((total, analysis) => total + (eventCountsByProposal.get(analysis.proposal.proposalId) ?? 0), 0)
  ));

  return THEME_NAMES.map((theme) => {
    const matching = analyses.filter((analysis) => analysis.themes.includes(theme));
    if (matching.length === 0) return null;
    const dominantSubTrends = buildDominantSubTrends(theme, matching);
    const recentChangeCount = matching.reduce(
      (total, item) => total + (eventCountsByProposal.get(item.proposal.proposalId) ?? 0),
      0,
    );
    const maturityRatio = calculateMaturityRatio(matching);
    const maturitySignal = maturityRatio >= 0.5 ? "high" : maturityRatio >= 0.2 ? "medium" : "low";
    const kgldOverlapCount = matching.filter((item) => kgldCandidateIds.has(item.proposal.proposalId)).length;
    const discussionProposalCount = matching.filter((item) =>
      (item.proposal.discussionLinks?.length ?? 0) > 0 || Boolean(item.proposal.discussionTo)
    ).length;
    const contentChangeCount = recentEvents.filter((event) =>
      event.type === "content_hash_change"
      && matching.some((item) => item.proposal.proposalId === event.proposalId)
    ).length;
    const momentumScore = calculateMomentumScore({
      proposalCount: matching.length,
      maxProposalCount,
      recentChangeCount,
      maxRecentChangeCount,
      maturityRatio,
      subTrendCount: dominantSubTrends.length,
      kgldOverlapCount,
      discussionRatio: matching.length ? discussionProposalCount / matching.length : 0,
      contentChangeCount,
      isStrategicTheme: isStrategicTheme(theme),
    });
    const interpretation = interpretTheme(
      theme,
      matching.length,
      dominantSubTrends,
      momentumScore,
      maturitySignal,
      recentChangeCount,
    );

    return {
      theme,
      proposalCount: matching.length,
      proposalCount180d: matching.length,
      recentChangeCount,
      recentChangeCount7d: recentChangeCount,
      discussionProposalCount,
      contentChangeCount,
      maturitySignal,
      momentumScore,
      dominantSubTrends,
      representativeProposals: matching
        .sort(compareAnalyses)
        .slice(0, 5)
        .map((item) => ({
          id: item.proposal.proposalId,
          title: item.proposal.title ?? "제목 없음",
          status: item.proposal.status ?? "미분류",
          oneLineSummary: item.oneLineSummary,
          canonicalUrl: item.proposal.canonicalUrl,
        })),
      trendInterpretation: interpretation,
      interpretation,
    };
  })
    .filter((item): item is ThemeInsight => item !== null)
    .sort((left, right) =>
      right.momentumScore - left.momentumScore
      || right.proposalCount - left.proposalCount
      || left.theme.localeCompare(right.theme)
    );
}

export function buildAccountAbstractionRadar(
  analyses: ProposalThemeAnalysis[],
): AccountAbstractionRadar {
  const matching = analyses.filter((item) => item.themes.includes("Account Abstraction"));
  const subTrends = buildDominantSubTrends("Account Abstraction", matching);
  return {
    proposalCount: matching.length,
    subTrendDistribution: Object.fromEntries(subTrends.map((item) => [item.name, item.count])),
    representativeProposals: matching.sort(compareAnalyses).slice(0, 5).map((item) => ({
      id: item.proposal.proposalId,
      title: item.proposal.title ?? "제목 없음",
      status: item.proposal.status ?? "미분류",
      oneLineSummary: item.oneLineSummary,
      canonicalUrl: item.proposal.canonicalUrl,
    })),
    trendInterpretation: interpretAccountAbstraction(matching.length, subTrends),
    kgldWalletUxInterpretation: "KGLD 지갑 경험은 스마트 계정 기반 가스비 대납, 제한된 세션 권한, 패스키 인증을 결합해 지갑 생성과 반복 서명 부담을 줄일 수 있습니다. 실제 적용 전에는 복구 정책, 위임 범위, Paymaster 비용 통제를 함께 검증해야 합니다.",
  };
}

function interpretAccountAbstraction(
  count: number,
  subTrends: DominantSubTrend[],
): string {
  if (count === 0) return "Account Abstraction 관련 제안은 현재 분석 기간에 확인되지 않았습니다.";
  const approaches = subTrends.slice(0, 4).map((item) => item.name).join(", ");
  if (!approaches) {
    return `Account Abstraction 영역에서는 최근 180일 기준 ${count}개 제안이 확인됩니다. EOA 기반 사용 경험을 smart account와 프로그래밍 가능한 권한 구조로 옮기려는 흐름으로 해석할 수 있습니다.`;
  }
  return `Account Abstraction 영역에서는 최근 180일 기준 ${count}개 제안이 확인되며 ${approaches} 접근 방식이 핵심 흐름으로 나타납니다. EOA 중심 UX에서 smart account, paymaster, session key, passkey, modular account 기반의 permission/automation 구조로 이동하는 신호입니다.`;
}

function buildDominantSubTrends(
  theme: ThemeName,
  analyses: ProposalThemeAnalysis[],
): DominantSubTrend[] {
  const counts: CountByLabel = {};
  for (const analysis of analyses) {
    for (const name of analysis.subTrendsByTheme[theme] ?? []) {
      counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  const rules = SUB_TREND_RULES[theme] ?? [];
  return Object.entries(counts)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5)
    .map(([name, count]) => ({
      name,
      count,
      description: rules.find((item) => item.name === name)?.description
        ?? `${theme} 기술 테마에서 반복적으로 제안되는 세부 접근 방식입니다.`,
    }));
}

function interpretTheme(
  theme: ThemeName,
  count: number,
  subTrends: DominantSubTrend[],
  momentumScore = 0,
  maturitySignal: "low" | "medium" | "high" = "low",
  recentChangeCount = 0,
): string {
  if (count === 0) return `${theme} 관련 제안은 현재 분석 기간에 확인되지 않았습니다.`;
  const approaches = subTrends.slice(0, 3).map((item) => item.name).join(", ");
  const maturityText = maturitySignal === "high"
    ? "Review/Last Call/Final 단계 제안 비중이 높아 표준화 성숙도와 후속 문안 변화를 함께 봐야 합니다"
    : maturitySignal === "medium"
      ? "일부 제안이 성숙 단계에 진입해 단기 검토 가치가 있습니다"
      : "아직 초기 논의 성격이 강해 방향성 관찰이 우선입니다";
  if (!approaches) {
    return `${theme} 영역에서는 최근 180일 기준 ${count}개 제안이 확인되며 momentum score는 ${momentumScore}/100입니다. 최근 7일 변경사항은 ${recentChangeCount}건이고, ${maturityText}. 공통 인터페이스와 실행 조건을 정교화하는 흐름으로 해석됩니다.`;
  }
  return `${theme} 영역에서는 최근 180일 기준 ${count}개 제안이 확인되며 ${approaches} 접근 방식이 반복적으로 등장합니다. 최근 7일 변경사항은 ${recentChangeCount}건, momentum score는 ${momentumScore}/100이고 ${maturityText}. 단일 기능보다 실제 통합, 권한, 상호운용에 필요한 실행 규칙을 구체화하는 흐름으로 볼 수 있습니다.`;
}

function countRecentEventsByProposal(events: ChangeEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.proposalId, (counts.get(event.proposalId) ?? 0) + 1);
  }
  return counts;
}

function calculateMaturityRatio(analyses: ProposalThemeAnalysis[]): number {
  if (analyses.length === 0) return 0;
  const mature = analyses.filter((analysis) => {
    const status = analysis.proposal.status?.toLocaleLowerCase("en-US");
    return status === "review" || status === "last call" || status === "final";
  }).length;
  return mature / analyses.length;
}

type MomentumInput = {
  proposalCount: number;
  maxProposalCount: number;
  recentChangeCount: number;
  maxRecentChangeCount: number;
  maturityRatio: number;
  subTrendCount: number;
  kgldOverlapCount: number;
  discussionRatio: number;
  contentChangeCount: number;
  isStrategicTheme: boolean;
};

function calculateMomentumScore(input: MomentumInput): number {
  const proposalScore = Math.min(24, (input.proposalCount / input.maxProposalCount) * 24);
  const changeScore = Math.min(18, (input.recentChangeCount / input.maxRecentChangeCount) * 18);
  const maturityScore = Math.min(18, input.maturityRatio * 18);
  const diversityScore = Math.min(14, (input.subTrendCount / 5) * 14);
  const kgldScore = Math.min(8, (input.kgldOverlapCount / 3) * 8);
  const discussionScore = Math.min(8, input.discussionRatio * 8);
  const diffScore = Math.min(4, input.contentChangeCount * 2);
  const strategicScore = input.isStrategicTheme ? 6 : 0;
  return Math.min(100, Math.round(proposalScore + changeScore + maturityScore + diversityScore + kgldScore + discussionScore + diffScore + strategicScore));
}

function isStrategicTheme(theme: ThemeName): boolean {
  return new Set<ThemeName>([
    "Account Abstraction",
    "Wallet UX",
    "Smart Account",
    "Gasless / Paymaster",
    "Session Key / Delegation",
    "Passkey / WebAuthn",
    "RWA / Attestation",
    "Oracle / Pricing",
    "Signature / Security",
    "Transaction Model / Execution",
    "Compliance / Restricted Transfer",
    "DeFi / Vault",
    "Network Upgrade / Governance",
    "Block / Validator Operations",
  ]).has(theme);
}

function searchableText(record: ProposalRecord): string {
  return [
    record.proposalId,
    record.title,
    record.description,
    record.bodyExcerpt,
    record.proposalType,
    record.category,
    ...(record.keywords ?? []),
  ].filter(Boolean).join(" ").toLocaleLowerCase("en-US");
}

function compareAnalyses(left: ProposalThemeAnalysis, right: ProposalThemeAnalysis): number {
  return statusRank(right.proposal.status) - statusRank(left.proposal.status)
    || dateValue(right.proposal.updated ?? right.proposal.created) - dateValue(left.proposal.updated ?? left.proposal.created)
    || left.proposal.proposalId.localeCompare(right.proposal.proposalId, undefined, { numeric: true });
}

function statusRank(status: string | null): number {
  const normalized = status?.toLocaleLowerCase("en-US");
  if (normalized === "last call") return 5;
  if (normalized === "final") return 4;
  if (normalized === "review") return 3;
  if (normalized === "draft") return 2;
  return 1;
}

function dateValue(value: string | null | undefined): number {
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function rule(name: string, keywords: string[], description: string): Rule {
  return { name, keywords, description };
}

function limitSentence(value: string): string {
  const sentence = value.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? value;
  return sentence.length <= 140 ? sentence : `${sentence.slice(0, 137).trim()}...`;
}
