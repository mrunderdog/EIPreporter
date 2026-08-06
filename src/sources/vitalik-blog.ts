import { createHash } from "node:crypto";

export type VitalikBlogSourceState = "collected" | "partial" | "unavailable";
export type VitalikBlogDiscoveryMethod = "official_feed" | "official_index_html";
export type VitalikBlogPublicationPrecision = "date" | "datetime" | "unknown";

export type VitalikBlogPostFact = {
  factId: string;
  sourceType: "vitalik_blog_post";
  title: string;
  sourceUrl: string;
  canonicalUrl: string;
  publishedAt: string | null;
  publicationDatePrecision: VitalikBlogPublicationPrecision;
  author: "Vitalik Buterin";
  originalLanguage: string | null;
  cleanedText: string;
  sourceExcerpt: string;
  headingTexts: string[];
  outboundLinks: string[];
  contentHash: string;
  fetchedAt: string;
  parseState: "body_parsed" | "metadata_only" | "parse_failed";
  evidenceParagraphs: Array<{ paragraphId: string; text: string }>;
};

export type VitalikBlogDiagnostics = {
  feedUrl: string | null;
  indexStatus?: number;
  feedCandidateCount?: number;
  feedPreview?: string;
  articleStatuses: Array<{ url: string; status: number | null; parseState: string; error?: string }>;
  errors: string[];
  durationMs?: number;
};

export type VitalikBlogSourceResult = {
  sourceState: VitalikBlogSourceState;
  sourceUrl: string;
  discoveryMethod: VitalikBlogDiscoveryMethod;
  fetchedAt: string;
  latestPublishedAt: string | null;
  posts: VitalikBlogPostFact[];
  diagnostics: VitalikBlogDiagnostics;
};

export type VitalikBlogPostView = {
  factId: string;
  title: string;
  sourceUrl: string;
  publishedAtLabel: string;
  topicLabelsKo: string[];
  summaryKo: string | null;
  summaryState: "reviewed" | "generated_existing_adapter" | "extractive_original" | "pending_review";
  whyItMattersKo: string[];
  interpretationState: "grounded" | "limited" | "pending_review";
  personalViewDisclaimerKo: string;
  relatedProposalIds: string[];
  relatedProposalRelation: "explicit" | "inferred" | "none";
  evidenceParagraphIds: string[];
  sourceExcerpt: string;
};

export type VitalikBlogView = {
  sourceState: VitalikBlogSourceState;
  sourceUrl: string;
  discoveryMethod: VitalikBlogDiscoveryMethod;
  fetchedAt: string;
  latestPublishedAt: string | null;
  recentWindowDays: number;
  collectedPostCount: number;
  recentPostCount: number;
  selectedPosts: VitalikBlogPostView[];
  limitationsKo: string[];
  diagnostics?: VitalikBlogDiagnostics;
};

export type VitalikBlogEditorialOverride = {
  canonicalUrl: string;
  contentHash: string;
  summaryKo: string;
  whyItMattersKo: string[];
  topicLabelsKo: string[];
  relatedProposalIds: string[];
  relatedProposalRelation: "explicit" | "inferred" | "none";
  evidenceParagraphIds: string[];
  reviewedAt: string;
};

const ROOT_URL = "https://vitalik.eth.limo/";
const MAX_ARTICLES = 10;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const USER_AGENT = "EIPreporter/0.1 VitalikBlogSource";

export function buildUnavailableVitalikBlogView(reason = "Vitalik Blog source not present in snapshot."): VitalikBlogView {
  const fetchedAt = "";
  return {
    sourceState: "unavailable",
    sourceUrl: ROOT_URL,
    discoveryMethod: "official_index_html",
    fetchedAt,
    latestPublishedAt: null,
    recentWindowDays: 45,
    collectedPostCount: 0,
    recentPostCount: 0,
    selectedPosts: [],
    limitationsKo: [reason],
    diagnostics: { feedUrl: null, articleStatuses: [], errors: [reason] },
  };
}

export async function collectVitalikBlogSource(now = new Date(), fetchImpl: typeof fetch = fetch): Promise<VitalikBlogSourceResult> {
  const started = Date.now();
  const fetchedAt = now.toISOString();
  const diagnostics: VitalikBlogDiagnostics = { feedUrl: null, articleStatuses: [], errors: [] };
  try {
    const index = await fetchText(ROOT_URL, fetchImpl);
    diagnostics.indexStatus = index.status;
    const feedUrl = discoverOfficialFeed(index.text, ROOT_URL);
    diagnostics.feedUrl = feedUrl;
    let candidates = parseVitalikBlogIndex(index.text, ROOT_URL);
    if (feedUrl) {
      const feed = await fetchText(feedUrl, fetchImpl);
      diagnostics.feedPreview = cleanText(feed.text).slice(0, 200);
      candidates = parseVitalikBlogFeed(feed.text, feedUrl);
      diagnostics.feedCandidateCount = candidates.length;
    }
    candidates = candidates.slice(0, MAX_ARTICLES);
    const seen = new Set<string>();
    const posts: VitalikBlogPostFact[] = [];
    for (const candidate of candidates) {
      if (seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      try {
        const article = await fetchText(candidate.url, fetchImpl);
        const parsed = parseVitalikBlogArticle(article.text, candidate.url, fetchedAt, candidate.publishedAt);
        posts.push(parsed);
        diagnostics.articleStatuses.push({ url: candidate.url, status: article.status, parseState: parsed.parseState });
      } catch (error) {
        diagnostics.articleStatuses.push({ url: candidate.url, status: null, parseState: "parse_failed", error: errorMessage(error) });
      }
    }
    diagnostics.durationMs = Date.now() - started;
    return {
      sourceState: posts.length === 0 ? "unavailable" : diagnostics.articleStatuses.some((item) => item.parseState === "parse_failed") ? "partial" : "collected",
      sourceUrl: ROOT_URL,
      discoveryMethod: feedUrl ? "official_feed" : "official_index_html",
      fetchedAt,
      latestPublishedAt: latestPublishedAt(posts),
      posts: dedupePosts(posts),
      diagnostics,
    };
  } catch (error) {
    diagnostics.durationMs = Date.now() - started;
    diagnostics.errors.push(errorMessage(error));
    return {
      sourceState: "unavailable",
      sourceUrl: ROOT_URL,
      discoveryMethod: "official_index_html",
      fetchedAt,
      latestPublishedAt: null,
      posts: [],
      diagnostics,
    };
  }
}

export function parseVitalikBlogIndex(html: string, rootUrl = ROOT_URL): Array<{ title: string; url: string; publishedAt: string | null }> {
  const links = [...html.matchAll(/<a\s+[^>]*href=["']([^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const items = links
    .map((match) => {
      const url = safeResolveUrl(match[1]!, rootUrl);
      if (!url || new URL(url).hostname !== "vitalik.eth.limo") return null;
      if (!/\/general\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.html$/.test(new URL(url).pathname)) return null;
      const title = cleanText(match[2]!);
      const publishedAt = dateFromUrl(url);
      return title ? { title, url, publishedAt } : null;
    })
    .filter((item): item is { title: string; url: string; publishedAt: string | null } => Boolean(item));
  return dedupeBy(items, (item) => item.url);
}

export function parseVitalikBlogFeed(xml: string, feedUrl = `${ROOT_URL}feed.xml`): Array<{ title: string; url: string; publishedAt: string | null }> {
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const entries = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  const blocks = items.length ? items : entries;
  return blocks.map((item) => {
    const rawUrl = cleanText(firstMatch(item, /<link>([\s\S]*?)<\/link>/i) ?? firstMatch(item, /<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i) ?? "");
    const resolved = safeResolveUrl(rawUrl, feedUrl);
    const url = normalizeVitalikUrl(resolved);
    if (!url || new URL(url).hostname !== "vitalik.eth.limo") return null;
    if (!/\/general\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.html$/.test(new URL(url).pathname)) return null;
    const title = cleanText(firstMatch(item, /<title>([\s\S]*?)<\/title>/i) ?? "");
    const dateText = cleanText(firstMatch(item, /<pubDate>([\s\S]*?)<\/pubDate>/i) ?? firstMatch(item, /<updated>([\s\S]*?)<\/updated>/i) ?? firstMatch(item, /<published>([\s\S]*?)<\/published>/i) ?? "");
    const publishedAt = dateText ? normalizeDateText(dateText) : dateFromUrl(url);
    return title ? { title, url, publishedAt } : null;
  }).filter((item): item is { title: string; url: string; publishedAt: string | null } => Boolean(item));
}

export function parseVitalikBlogArticle(html: string, sourceUrl: string, fetchedAt: string, indexPublishedAt: string | null = null): VitalikBlogPostFact {
  const canonicalUrl = discoverCanonicalUrl(html, sourceUrl) ?? sourceUrl;
  const title = cleanText(firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? "");
  const published = publicationDate(html, sourceUrl, indexPublishedAt);
  const bodyHtml = articleBodyHtml(html);
  const paragraphs = extractParagraphs(bodyHtml);
  const headings = [...bodyHtml.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi)].map((match) => cleanText(match[1]!)).filter(Boolean);
  const cleanedText = paragraphs.join("\n\n");
  const contentHash = createHash("sha256").update(`${canonicalUrl}\n${title}\n${cleanedText}`).digest("hex");
  const evidenceParagraphs = paragraphs.slice(0, 12).map((text, index) => ({ paragraphId: `p${index + 1}`, text }));
  return {
    factId: `vitalik-blog:${contentHash.slice(0, 16)}`,
    sourceType: "vitalik_blog_post",
    title,
    sourceUrl,
    canonicalUrl,
    publishedAt: published.publishedAt,
    publicationDatePrecision: published.precision,
    author: "Vitalik Buterin",
    originalLanguage: "en",
    cleanedText,
    sourceExcerpt: paragraphs[0] ?? "",
    headingTexts: headings,
    outboundLinks: outboundLinks(bodyHtml, sourceUrl),
    contentHash,
    fetchedAt,
    parseState: title && cleanedText.length > 200 ? "body_parsed" : cleanedText ? "metadata_only" : "parse_failed",
    evidenceParagraphs,
  };
}

export function buildVitalikBlogView(
  source: VitalikBlogSourceResult | undefined,
  reportAsOf: string,
  overrides: VitalikBlogEditorialOverride[] = [],
): VitalikBlogView {
  if (!source) return buildUnavailableVitalikBlogView();
  const overrideByKey = new Map(overrides.map((item) => [`${normalizeUrl(item.canonicalUrl)}:${item.contentHash}`, item]));
  const posts = source.posts
    .slice()
    .sort((a, b) => comparePublishedDesc(a, b));
  const recent = posts.filter((post) => post.publishedAt && post.publicationDatePrecision !== "unknown" && withinDays(post.publishedAt, reportAsOf, 45));
  const selectedFacts = (recent.length ? recent : posts.filter((post) => post.publicationDatePrecision !== "unknown").slice(0, 3)).slice(0, 4);
  const selectedPosts = selectedFacts.map((post) => {
    const override = overrideByKey.get(`${normalizeUrl(post.canonicalUrl)}:${post.contentHash}`);
    return postView(post, override);
  });
  const limitationsKo = [
    "Vitalik Blog는 Vitalik Buterin의 개인 글이며, Ethereum의 공식 로드맵이나 커뮤니티 합의를 의미하지 않습니다.",
  ];
  if (recent.length === 0 && posts.length > 0) limitationsKo.push("최근 45일 내 새 글이 없어 마지막으로 공개된 글을 표시합니다.");
  if (source.sourceState !== "collected") limitationsKo.push("Vitalik Blog 일부 글을 수집하지 못했습니다.");
  return {
    sourceState: source.sourceState,
    sourceUrl: source.sourceUrl,
    discoveryMethod: source.discoveryMethod,
    fetchedAt: source.fetchedAt,
    latestPublishedAt: source.latestPublishedAt,
    recentWindowDays: 45,
    collectedPostCount: source.posts.length,
    recentPostCount: recent.length,
    selectedPosts,
    limitationsKo,
    diagnostics: source.diagnostics,
  };
}

export const vitalikBlogEditorialOverrides: VitalikBlogEditorialOverride[] = [
  {
    canonicalUrl: "https://vitalik.eth.limo/general/2026/07/28/obfuscation_part_ii_diamond_io.html",
    contentHash: "d26a3a52575cfe557a2cf9d3d3bc89d90482e8aca6fc2f6121039e357197727e",
    summaryKo: "이 글은 암호학적 난독화(iO) 계열 중 Diamond iO 접근을 설명하며, 프로그램을 실행 가능하게 유지하면서 내부 구조를 숨기는 문제를 다룹니다. Vitalik은 이전 글에서 다룬 보수적 iO 기술 흐름을 이어 받아, 구성 요소와 제약을 더 구체적으로 살펴봅니다. 글은 이 기술이 아직 연구 단계이며 효율성, 가정, 검증 가능성이 핵심 한계임을 전제로 둡니다.",
    whyItMattersKo: [
      "iO는 당장 Ethereum 기능으로 채택되는 기술이 아니라, 장기적으로 프라이버시와 검증 가능한 계산을 이해하는 암호학적 배경입니다.",
      "이번 보고서의 EIP/ERC 제안군과 직접 합산하지 않고, ZK·검증·프라이버시 설계 흐름을 읽는 보조 근거로만 보는 것이 적절합니다.",
    ],
    topicLabelsKo: ["암호학", "프라이버시"],
    relatedProposalIds: [],
    relatedProposalRelation: "none",
    evidenceParagraphIds: ["p1", "p2", "p3"],
    reviewedAt: "2026-08-06",
  },
  {
    canonicalUrl: "https://vitalik.eth.limo/general/2026/06/29/obfuscation1.html",
    contentHash: "045e71c37ed2cf01d9c55743126bd9c244aae1754e99f73dc1a9760b734005bb",
    summaryKo: "이 글은 암호학적 난독화가 무엇인지, 프로그램을 ‘암호화된 프로그램’처럼 변환하면서도 실행 결과는 유지하려는 목표를 설명합니다. Vitalik은 iO를 매우 강력하지만 아직 실용화까지는 먼 암호학 primitive로 다루며, 가능한 응용과 기술적 난점을 함께 소개합니다. 글의 초점은 Ethereum 로드맵 발표가 아니라 장기 암호학 연구의 배경 설명입니다.",
    whyItMattersKo: [
      "프로그램 검증, 프라이버시, 암호학적 실행 모델을 장기적으로 이해하는 데 필요한 배경을 제공합니다.",
      "현재 EIP/ERC 지표와 직접 합산하지 않고, ZK·프라이버시·검증 가능성 논의를 해석하는 보조 맥락으로만 사용합니다.",
    ],
    topicLabelsKo: ["암호학", "프라이버시"],
    relatedProposalIds: [],
    relatedProposalRelation: "none",
    evidenceParagraphIds: ["p1", "p2", "p3"],
    reviewedAt: "2026-08-06",
  },
];

function postView(post: VitalikBlogPostFact, override: VitalikBlogEditorialOverride | undefined): VitalikBlogPostView {
  const parsed = post.parseState === "body_parsed";
  return {
    factId: post.factId,
    title: post.title,
    sourceUrl: post.sourceUrl,
    publishedAtLabel: formatPublishedDate(post),
    topicLabelsKo: override?.topicLabelsKo ?? inferTopics(post),
    summaryKo: override?.summaryKo ?? (parsed ? extractiveSummary(post) : null),
    summaryState: override ? "reviewed" : parsed ? "extractive_original" : "pending_review",
    whyItMattersKo: override?.whyItMattersKo ?? [],
    interpretationState: override ? "grounded" : parsed ? "limited" : "pending_review",
    personalViewDisclaimerKo: "개인 글이며 Ethereum의 공식 로드맵이나 커뮤니티 합의를 뜻하지 않습니다.",
    relatedProposalIds: override?.relatedProposalIds ?? [],
    relatedProposalRelation: override?.relatedProposalRelation ?? "none",
    evidenceParagraphIds: override?.evidenceParagraphIds ?? post.evidenceParagraphs.slice(0, 2).map((paragraph) => paragraph.paragraphId),
    sourceExcerpt: post.sourceExcerpt,
  };
}

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<{ status: number; text: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchTextOnce(url, fetchImpl);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(250 * (2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchTextOnce(url: string, fetchImpl: typeof fetch): Promise<{ status: number; text: string }> {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error(`unsupported protocol: ${parsed.protocol}`);
  if (parsed.hostname !== "vitalik.eth.limo") throw new Error(`unexpected host: ${parsed.hostname}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetchImpl(url, {
      headers: { "user-agent": USER_AGENT, "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5" },
      redirect: "follow",
      signal: controller.signal,
    });
    const finalUrl = new URL(response.url);
    if (finalUrl.hostname !== "vitalik.eth.limo") throw new Error(`redirected to unexpected host: ${finalUrl.hostname}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml|application\/xml|text\/xml/i.test(contentType)) throw new Error(`unexpected content-type: ${contentType || "missing"}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error("response too large");
    return { status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function discoverOfficialFeed(html: string, rootUrl: string): string | null {
  for (const match of html.matchAll(/<link\s+[^>]*rel=["']alternate["'][^>]*>/gi)) {
    const tag = match[0];
    if (!/rss|atom|feed/i.test(tag)) continue;
    const href = firstMatch(tag, /href=["']([^"']+)["']/i);
    const url = href ? safeResolveUrl(href, rootUrl) : null;
    if (url && new URL(url).hostname === "vitalik.eth.limo") return url;
  }
  return null;
}

function discoverCanonicalUrl(html: string, sourceUrl: string): string | null {
  for (const match of html.matchAll(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi)) {
    const href = firstMatch(match[0], /href=["']([^"']+)["']/i);
    const url = href ? safeResolveUrl(href, sourceUrl) : null;
    if (url && new URL(url).hostname === "vitalik.eth.limo") return url;
  }
  return null;
}

function publicationDate(html: string, sourceUrl: string, indexPublishedAt: string | null) {
  const meta = firstMatch(html, /<meta\s+[^>]*(?:property|name)=["']article:published_time["'][^>]*content=["']([^"']+)["'][^>]*>/i)
    ?? firstMatch(html, /<time\s+[^>]*datetime=["']([^"']+)["'][^>]*>/i);
  if (meta) return { publishedAt: meta, precision: meta.includes("T") ? "datetime" as const : "date" as const };
  const textDate = firstMatch(html, /(?:Published|Date)\s*:?\s*([A-Z][a-z]+ \d{1,2}, \d{4}|\d{4}-\d{2}-\d{2})/i);
  if (textDate) return { publishedAt: normalizeDateText(textDate), precision: "date" as const };
  const urlDate = dateFromUrl(sourceUrl);
  if (urlDate) return { publishedAt: urlDate, precision: "date" as const };
  return { publishedAt: indexPublishedAt, precision: indexPublishedAt ? "date" as const : "unknown" as const };
}

function articleBodyHtml(html: string): string {
  const body = firstMatch(html, /<article[^>]*>([\s\S]*?)<\/article>/i)
    ?? firstMatch(html, /<main[^>]*>([\s\S]*?)<\/main>/i)
    ?? firstMatch(html, /<body[^>]*>([\s\S]*?)<\/body>/i)
    ?? html;
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");
}

function extractParagraphs(html: string): string[] {
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanText(match[1]!))
    .filter((text) => !/Dark Mode Toggle|See all posts|Special thanks/i.test(text))
    .filter((text) => text.length >= 40);
  if (paragraphs.length) return paragraphs;
  return cleanText(html).split(/\n{2,}/).map((text) => text.trim()).filter((text) => text.length >= 40);
}

function outboundLinks(html: string, sourceUrl: string): string[] {
  const links = [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)]
    .map((match) => safeResolveUrl(match[1]!, sourceUrl))
    .filter((url): url is string => typeof url === "string" && /^https?:\/\//.test(url));
  return dedupeBy(links, (url) => url).slice(0, 80);
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function firstMatch(value: string, pattern: RegExp): string | null {
  return value.match(pattern)?.[1] ?? null;
}

function safeResolveUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeVitalikUrl(value: string | null): string | null {
  if (!value) return null;
  const url = new URL(value);
  if (url.hostname === "vitalik.ca") url.hostname = "vitalik.eth.limo";
  return url.toString();
}

function dateFromUrl(url: string): string | null {
  const match = url.match(/\/general\/(\d{4})\/(\d{2})\/(\d{2})\//);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function normalizeDateText(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : value;
}

function formatPublishedDate(post: VitalikBlogPostFact): string {
  if (!post.publishedAt) return "게시일 미확인";
  if (post.publicationDatePrecision === "date") return post.publishedAt.slice(0, 10).replace(/-/g, ".");
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(post.publishedAt)).replace(/\. /g, ".").replace(/\.$/, "");
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString();
}

function dedupePosts(posts: VitalikBlogPostFact[]): VitalikBlogPostFact[] {
  const seen = new Set<string>();
  const result: VitalikBlogPostFact[] = [];
  for (const post of posts) {
    const key = `${normalizeUrl(post.canonicalUrl)}:${post.contentHash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(post);
  }
  return result;
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function latestPublishedAt(posts: VitalikBlogPostFact[]): string | null {
  return posts.map((post) => post.publishedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function comparePublishedDesc(a: VitalikBlogPostFact, b: VitalikBlogPostFact): number {
  return String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")) || a.title.localeCompare(b.title);
}

function withinDays(date: string, reportAsOf: string, days: number): boolean {
  const start = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(reportAsOf);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return start <= end && end - start <= days * 24 * 60 * 60 * 1000;
}

function inferTopics(post: VitalikBlogPostFact): string[] {
  const text = `${post.title} ${post.cleanedText}`.toLowerCase();
  const topics: string[] = [];
  if (/obfuscat|cryptograph|proof|zero-knowledge|zk/.test(text)) topics.push("암호학");
  if (/privacy|private/.test(text)) topics.push("프라이버시");
  if (/protocol|ethereum|blockchain/.test(text)) topics.push("Ethereum protocol");
  if (/governance|coordination|society|politic/.test(text)) topics.push("사회·철학");
  return topics.slice(0, 3).length ? topics.slice(0, 3) : ["기타"];
}

function extractiveSummary(post: VitalikBlogPostFact): string {
  const first = post.evidenceParagraphs[0]?.text ?? post.sourceExcerpt;
  return first.length > 360 ? `${first.slice(0, 357).trim()}...` : first;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
