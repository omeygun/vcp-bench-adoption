/** Create the MongoDB indexes (idempotent). npx tsx tools/create-indexes.ts   env: MONGODB_URI, MONGODB_DB */
import { closeStore, ensureIndexes } from "../lib/store";
ensureIndexes().then(closeStore).then(() => { console.log("indexes ready on", process.env.MONGODB_DB || "vcp-benches", ".items"); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
