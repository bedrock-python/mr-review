import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "../src/shared/api/mocks/handlers.ts");
let s = fs.readFileSync(p, "utf8");

const helpers = `function internalDependency(
  idSuffix: string,
  consumer_service_id: string,
  provider_service_id: string,
  criticality: ServiceDependency["criticality"]
): ServiceDependency {
  return {
    id: \`f50e8400-e29b-41d4-a716-44665544\${idSuffix}\`,
    consumer_service_id,
    provider_service_id,
    criticality,
    latency_p50_ms: null,
    latency_p95_ms: null,
    latency_p99_ms: null,
    retry_policy: null,
    created_at: "2024-02-25T10:00:00Z",
    updated_at: "2024-02-25T10:00:00Z",
  };
}

const externalDependency = internalDependency;
`;

s = s.replace(
  /function mockDependency\([\s\S]*?^const MOCK_SERVICE_DEPENDENCIES/m,
  `${helpers}\nconst MOCK_SERVICE_DEPENDENCIES`
);

function stripNoteCalls(src, name) {
  const re = new RegExp(
    `${name}\\(\\s*` +
      `("[^"]*")\\s*,\\s*` +
      `([^,\\n]+)\\s*,\\s*` +
      `([^,\\n]+)\\s*,\\s*` +
      `("(?:critical|high|medium|low)")\\s*,\\s*\\n` +
      `\\s*"[^"]*"\\s*\\n` +
      `\\s*\\)`,
    "g"
  );
  return src.replace(re, `${name}($1, $2, $3, $4)`);
}

s = stripNoteCalls(s, "internalDependency");
s = stripNoteCalls(s, "externalDependency");

fs.writeFileSync(p, s);
console.log("ok");
