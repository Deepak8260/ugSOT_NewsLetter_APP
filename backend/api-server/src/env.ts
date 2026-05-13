import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Built output lives in `dist/`; repo root is three levels up.
const repoRootEnv = path.resolve(__dirname, "../../../.env");
const packageEnv = path.resolve(__dirname, "../.env");
config({ path: repoRootEnv });
config({ path: packageEnv, override: true });
