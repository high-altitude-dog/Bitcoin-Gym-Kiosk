// Builds the kiosk against the mock Store API address, then runs every
// *.test.mjs here in its own process (so each gets a fresh server, browser and
// mock). `npm run test:e2e` runs them all; `npm run test:e2e -- rotation` runs
// the ones whose file name contains "rotation".
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { API } from "./support.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const kiosk = path.resolve(here, "..", "..")
const dist = fs.mkdtempSync(path.join(os.tmpdir(), "kiosk-e2e-dist-"))
const filters = process.argv.slice(2)

console.log(`Building the kiosk into ${dist} ...`)
const build = spawnSync("npx", ["vite", "build", "--outDir", dist, "--emptyOutDir", "--logLevel", "warn"], {
  cwd: kiosk,
  stdio: "inherit",
  // These override the kiosk's .env, so the tests never depend on (or touch) a real backend.
  env: { ...process.env, VITE_MEDUSA_BACKEND_URL: API, VITE_MEDUSA_PUBLISHABLE_KEY: "pk_e2e" },
})
if (build.status !== 0) process.exit(build.status ?? 1)

const suites = fs.readdirSync(here).filter((f) => f.endsWith(".test.mjs") && (!filters.length || filters.some((x) => f.includes(x)))).sort()
if (!suites.length) { console.error("No suites match."); process.exit(1) }
let failed = 0
for (const suite of suites) {
  console.log(`\n=== ${suite}`)
  const run = spawnSync("node", [path.join(here, suite)], { stdio: "inherit", env: { ...process.env, KIOSK_DIST: dist } })
  if (run.status !== 0) failed++
}
fs.rmSync(dist, { recursive: true, force: true })
console.log(failed ? `\n${failed} of ${suites.length} suites FAILED` : `\nAll ${suites.length} suites passed`)
process.exit(failed ? 1 : 0)
