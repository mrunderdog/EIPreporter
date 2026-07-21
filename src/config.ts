import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type AppConfig = {
  databasePath: string;
  githubToken: string | undefined;
  telegramBotToken: string | undefined;
  telegramChatId: string | undefined;
  timezone: string;
};

export function loadDotEnv(path = ".env"): void {
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function getConfig(): AppConfig {
  loadDotEnv();

  return {
    databasePath: normalizeDatabasePath(process.env.DATABASE_URL || "data/eipreporter.sqlite"),
    githubToken: process.env.GITHUB_TOKEN || undefined,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
    telegramChatId: process.env.TELEGRAM_CHAT_ID || undefined,
    timezone: process.env.TIMEZONE || "Asia/Seoul",
  };
}

export function parseArgs(args: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;

    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

export function resolveDatabasePath(args: Record<string, string | boolean>): string {
  const fromArg = args.db;
  if (typeof fromArg === "string" && fromArg.length > 0) {
    return normalizeDatabasePath(fromArg);
  }

  return getConfig().databasePath;
}

function normalizeDatabasePath(value: string): string {
  if (value === ":memory:") return value;
  if (value.startsWith("sqlite://")) return resolve(value.slice("sqlite://".length));
  if (value.startsWith("file:")) return resolve(value.slice("file:".length));
  return resolve(value);
}
