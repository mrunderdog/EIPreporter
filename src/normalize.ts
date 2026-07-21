import { createHash } from "node:crypto";
import { parseFrontmatter } from "./frontmatter.ts";
import type { ProposalKind, ProposalRecord, SourceRepo } from "./types.ts";

export type SourceDocument = {
  kind: ProposalKind;
  sourceRepo: SourceRepo;
  sourcePath: string;
  branch: string;
  markdown: string;
};

export function normalizeProposal(document: SourceDocument): ProposalRecord | null {
  const { data, body } = parseFrontmatter(document.markdown);
  const number = readProposalNumber(data, document.kind, document.sourcePath);
  if (number === null) return null;

  const proposalId = `${document.kind}-${number}`;
  const discussionLinks = readDiscussionLinks(data);
  const discussionUrl = discussionLinks[0] ?? null;
  return {
    proposalId,
    kind: document.kind,
    number,
    title: readString(data.title),
    status: readString(data.status),
    proposalType: readString(data.type),
    category: readString(data.category),
    created: readString(data.created),
    updated: readString(data.updated),
    discussionTo: discussionUrl,
    discussionUrl,
    discussionLinks,
    discussionSignal: buildDiscussionSignal(discussionLinks),
    description: readString(data.description),
    bodyExcerpt: extractBodyExcerpt(body),
    keywords: readKeywords(data),
    sourceRepo: document.sourceRepo,
    sourcePath: document.sourcePath,
    canonicalUrl: `https://github.com/${document.sourceRepo}/blob/${document.branch}/${document.sourcePath}`,
    rawContentHash: sha256(document.markdown),
  };
}

function readDiscussionLinks(data: Record<string, unknown>): string[] {
  const value = data["discussions-to"] ?? data["discussion-to"];
  const rawItems = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return [...new Set(rawItems.flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item)))];
}

function buildDiscussionSignal(discussionLinks: string[]): ProposalRecord["discussionSignal"] {
  const hasDiscussion = discussionLinks.length > 0;
  return {
    hasDiscussion,
    discussionUrl: discussionLinks[0] ?? null,
    discussionLinks,
    discussionScore: hasDiscussion ? 10 : null,
    discussionSummary: hasDiscussion
      ? "Discussion metadata available; activity details unavailable."
      : null,
    discussionEvidence: hasDiscussion ? "EIP/ERC frontmatter discussions-to metadata" : null,
  };
}

function extractBodyExcerpt(body: string): string | null {
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 4000) : null;
}

function readKeywords(data: Record<string, unknown>): string[] {
  const value = data.keywords ?? data.tags;
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function readProposalNumber(
  data: Record<string, unknown>,
  kind: ProposalKind,
  sourcePath: string,
): number | null {
  const key = kind.toLowerCase();
  const fromFrontmatter = readNumber(data[key] ?? data.eip ?? data.erc);
  if (fromFrontmatter !== null) return fromFrontmatter;

  const fileMatch = sourcePath.match(/(?:^|\/)(?:eip|erc)-(\d+)\.md$/i);
  return fileMatch ? Number(fileMatch[1]) : null;
}

function readString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(String).join(", ");
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
