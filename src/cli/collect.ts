import { getConfig, parseArgs, resolveDatabasePath } from "../config.ts";
import { collectProposals } from "../collector.ts";
import { insertSnapshot, openDatabase } from "../db.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = getConfig();
  const databasePath = resolveDatabasePath(args);

  console.log("Collecting EIP/ERC proposals...");
  const records = await collectProposals(config.githubToken);
  const db = openDatabase(databasePath);

  try {
    const snapshot = insertSnapshot(db, records);
    console.log(`Snapshot ${snapshot.id} saved: ${snapshot.proposalCount} proposals`);
    console.log(`Database: ${databasePath}`);
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
