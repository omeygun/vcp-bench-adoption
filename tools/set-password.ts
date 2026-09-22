/** Set or reset a staff password. npx tsx tools/set-password.ts email password   (env: MONGODB_URI or file store) */
import { setStaffPassword } from "../lib/auth";
import { closeStore } from "../lib/store";
const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 10) { console.error("usage: set-password.ts <email> <password (10+ chars)>"); process.exit(1); }
setStaffPassword(email, password, { mustChange: true }).then(closeStore).then(() => console.log("password set for", email.toLowerCase())).catch((e) => { console.error(e); process.exit(1); });
