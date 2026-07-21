import { parseArgs, resolveDatabasePath } from "../config.ts";
import { getChangeEvents, listSnapshots, openDatabase } from "../db.ts";
import { summarizeChanges } from "../diff.ts";

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const databasePath = resolveDatabasePath(args);
  const json = args.json === true;
  const db = openDatabase(databasePath);

  try {
    const [currentSnapshot] = listSnapshots(db, 1);
    if (!currentSnapshot) {
      console.log("No snapshots found. Run `npm run collect` first.");
      return;
    }

    const events = getChangeEvents(db, currentSnapshot.id);
    const summary = summarizeChanges(events);

    if (json) {
      console.log(
        JSON.stringify(
          {
            currentSnapshot,
            summary,
            events,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`New proposals: ${summary.new_proposal}`);
    console.log(`Status changes: ${summary.status_change}`);
    console.log(`Final transitions: ${summary.final_transition}`);
    console.log(`Withdrawn transitions: ${summary.withdrawn_transition}`);
    console.log(`Content changes: ${summary.content_hash_change}`);
  } finally {
    db.close();
  }
}

main();
