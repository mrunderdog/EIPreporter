import { analyzeProposal } from "./theme-engine.ts";
import type {
  KgldCandidate,
  KgldPotentialUseCase,
  KgldRecommendedAction,
  ProposalRecord,
  ProposalThemeAnalysis,
  ThemeName,
} from "./types.ts";

type KeywordRule = {
  keyword: string;
  weight: number;
  impact: number;
  effort: number;
  useCase: KgldPotentialUseCase;
  reasonCode: string;
};

const KEYWORD_RULES: KeywordRule[] = [
  ...rules(["account abstraction", "smart account", "paymaster", "passkey", "session key", "erc-4337", "erc-7579", "erc-6900"], 18, 5, 4, "KGLD Wallet UX", "HIGH_WALLET_UX_KEYWORD"),
  ...rules(["erc-4626", "vault", "oracle", "rwa", "attestation", "proof of reserve"], 18, 5, 3, "DeFi", "HIGH_DEFI_RWA_KEYWORD"),
  ...rules(["redemption", "redeem", "custody", "asset-backed", "tokenized"], 12, 5, 3, "KGLD Token / Issue / Redeem", "TOKEN_LIFECYCLE_KEYWORD"),
  ...rules(["permit", "signature", "replay protection", "identity", "compliance", "credential", "restricted transfer"], 12, 4, 3, "Compliance / Security", "SECURITY_COMPLIANCE_KEYWORD"),
  ...rules(["cross-chain", "bridge", "interoperab"], 9, 4, 4, "KGLD Token / Issue / Redeem", "CROSS_CHAIN_KEYWORD"),
  ...rules(["nft", "game", "gaming", "metaverse"], 3, 1, 2, "KGLD Wallet UX", "LOW_KGLD_KEYWORD"),
];

export const KGLD_KEYWORDS = KEYWORD_RULES.map((rule) => rule.keyword);

export function scoreKgldOpportunity(
  record: ProposalRecord,
  analysis: ProposalThemeAnalysis = analyzeProposal(record),
): KgldCandidate | null {
  const searchableText = [
    record.proposalId,
    record.title,
    record.description,
    record.bodyExcerpt,
    record.proposalType,
    record.category,
    ...(record.keywords ?? []),
  ].filter(Boolean).join(" ").toLocaleLowerCase("en-US");

  const matchedRules = KEYWORD_RULES.filter((rule) => searchableText.includes(rule.keyword));
  if (matchedRules.length === 0) return null;

  const status = record.status?.trim().toLocaleLowerCase("en-US") ?? "";
  const reasonCodes = new Set(matchedRules.map((rule) => rule.reasonCode));
  let score = Math.min(55, matchedRules.reduce((total, rule) => total + rule.weight, 0));

  if (record.kind === "ERC") {
    score += 12;
    reasonCodes.add("ERC_PROPOSAL");
  }
  if (record.sourceRepo === "ethereum/ercs") {
    score += 8;
    reasonCodes.add("ETHEREUM_ERCS_SOURCE");
  }

  const urgency = calculateUrgency(status);
  if (status === "last call") {
    score += 15;
    reasonCodes.add("STATUS_LAST_CALL");
  } else if (status === "final") {
    score += 15;
    reasonCodes.add("STATUS_FINAL");
  } else if (status === "review") {
    score += 8;
    reasonCodes.add("STATUS_REVIEW");
  } else if (status === "draft") {
    score += 4;
    reasonCodes.add("STATUS_DRAFT");
  } else if (status === "withdrawn") {
    score -= 30;
    reasonCodes.add("STATUS_WITHDRAWN");
  }

  const relevanceScore = clamp(Math.round(score), 0, 100);
  const matchedThemes = relevantThemes(analysis.themes);
  const potentialUseCases = [...new Set(matchedRules.map((rule) => rule.useCase))];

  return {
    proposalId: record.proposalId,
    title: record.title,
    status: record.status,
    sourceRepo: record.sourceRepo,
    canonicalUrl: record.canonicalUrl,
    oneLineSummary: analysis.oneLineSummary,
    matchedKeywords: [...new Set(matchedRules.map((rule) => rule.keyword))],
    matchedThemes,
    relevanceScore,
    whyRelevantToKGLD: buildWhyRelevant(matchedThemes, potentialUseCases),
    potentialUseCases,
    businessImpact: Math.max(...matchedRules.map((rule) => rule.impact)),
    implementationEffort: Math.max(...matchedRules.map((rule) => rule.effort)),
    urgency,
    recommendedAction: recommendAction(status, relevanceScore),
    reasonCodes: [...reasonCodes],
  };
}

function buildWhyRelevant(
  themes: ThemeName[],
  useCases: KgldPotentialUseCase[],
): string {
  const themeText = themes.slice(0, 3).join(", ") || "토큰 및 인프라";
  const useCaseText = useCases.join(", ");
  return `${themeText} 기술은 KGLD의 발행·상환, 지갑 경험, DeFi 연결 과정에 영향을 줄 수 있습니다. 특히 ${useCaseText} 적용 가능성과 보안·운영 복잡도를 함께 검토할 필요가 있습니다.`;
}

function relevantThemes(themes: ThemeName[]): ThemeName[] {
  const relevant = new Set<ThemeName>([
    "Account Abstraction", "Wallet UX", "Smart Account", "Gasless / Paymaster",
    "Session Key / Delegation", "Passkey / WebAuthn", "Token Standard",
    "DeFi / Vault", "Oracle / Pricing", "RWA / Attestation",
    "Identity / Credential", "Compliance / Restricted Transfer",
    "Cross-chain / Bridge", "Signature / Security",
  ]);
  return themes.filter((theme) => relevant.has(theme));
}

function rules(
  keywords: string[],
  weight: number,
  impact: number,
  effort: number,
  useCase: KgldPotentialUseCase,
  reasonCode: string,
): KeywordRule[] {
  return keywords.map((keyword) => ({ keyword, weight, impact, effort, useCase, reasonCode }));
}

function calculateUrgency(status: string): number {
  if (status === "last call") return 5;
  if (status === "final") return 4;
  if (status === "review") return 3;
  if (status === "withdrawn") return 1;
  return 2;
}

function recommendAction(status: string, score: number): KgldRecommendedAction {
  if (status === "withdrawn" || score < 20) return "ignore";
  if (score >= 75) return "poc";
  if (score >= 50) return "review";
  return "monitor";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
