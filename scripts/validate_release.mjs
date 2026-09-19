import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const registry = await readFile(new URL("supabase/functions/_shared/netflixErrorCodes.ts", root), "utf8");
const a2a = await readFile(new URL("supabase/functions/netflix-specialist-a2a/index.ts", root), "utf8");
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

const required = [
  "https://help.netflix.com/en/node/14424",
  "https://help.netflix.com/en/node/22210",
  "supportedInterfaces",
  'protocolBinding: "HTTP+JSON"',
  "securitySchemes",
];
for (const value of required) {
  if (!(registry + a2a).includes(value)) throw new Error(`Release contract missing: ${value}`);
}
for (const [group, dependencies] of Object.entries({ dependencies: packageJson.dependencies, devDependencies: packageJson.devDependencies })) {
  for (const [name, version] of Object.entries(dependencies)) {
    if (version === "latest" || String(version).includes("*") || /^[~^]/.test(String(version))) throw new Error(`${group}.${name} is not pinned`);
  }
}
console.log("Release contract validated");
