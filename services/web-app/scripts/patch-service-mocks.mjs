import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "../src/shared/api/mocks/handlers.ts");
let s = fs.readFileSync(p, "utf8");

function patchInternalBlock(body) {
  let b = body
    .replace(/\borganizationId:/g, "organization_id:")
    .replace(/\bparentId:/g, "parent_id:")
    .replace(/\bnodeType:/g, "node_type:")
    .replace(/\bcapabilityIds:/g, "capability_ids:")
    .replace(/\bcreatedAt:/g, "created_at:")
    .replace(/\brepositoryUrl:/g, "repository_url:");
  b = b.replace(/managedType: "([^"]+)"/g, (_m, slug) => {
    return `managed_service_type_id: MANAGED_DB_TYPE_ID_BY_SLUG["${slug}"]`;
  });
  b = b.replace(/^\s*version:.*\n/gm, "");
  b = b.replace(/^\s*endpoint:.*\n/gm, "");
  return b;
}

const reInternal =
  /(const MOCK_INTERNAL_SERVICES: InternalService\[\] = \[)([\s\S]*?)(\n\];[\s\n]*const MOCK_EXTERNAL)/;
const mi = s.match(reInternal);
if (!mi) {
  throw new Error("MOCK_INTERNAL_SERVICES block not found");
}
s = s.replace(reInternal, (_, h, body, t) => h + patchInternalBlock(body) + t);

fs.writeFileSync(p, s);
console.log("Patched MOCK_INTERNAL_SERVICES");
