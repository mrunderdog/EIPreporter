export type FrontmatterResult = {
  data: Record<string, unknown>;
  body: string;
};

export function parseFrontmatter(markdown: string): FrontmatterResult {
  const normalized = markdown.replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { data: {}, body: markdown };
  }

  return {
    data: parseSimpleYaml(match[1]),
    body: normalized.slice(match[0].length),
  };
}

function parseSimpleYaml(input: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  let currentKey: string | null = null;

  for (const rawLine of input.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;

    const continuation = rawLine.match(/^\s+-\s+(.*)$/);
    if (continuation && currentKey) {
      const current = data[currentKey];
      const nextValue = cleanScalar(continuation[1]);
      data[currentKey] = Array.isArray(current) ? [...current, nextValue] : [nextValue];
      continue;
    }

    const match = rawLine.match(/^([^:#][^:]*):\s*(.*)$/);
    if (!match) continue;

    currentKey = match[1].trim();
    const rawValue = match[2].trim();
    data[currentKey] = rawValue === "" ? null : cleanScalar(rawValue);
  }

  return data;
}

function cleanScalar(value: string): string | number | boolean {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");

  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === "true";
  }

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}
