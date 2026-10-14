#!/usr/bin/env node
/**
 * Generate Tauri updater static manifests (latest-<name>.json) from release
 * build artifacts.
 *
 * Usage:
 *   node gen-update-manifests.mjs \
 *     --artifacts <dir>   # downloaded artifact tree (searched recursively)
 *     --out <dir>         # destination for latest-*.json
 *     --tag v1.4.2        # source tag; version = tag minus leading "v"
 *     --dist base,bilin   # distributions that were built
 *     --repo OWNER/NAME   # used for absolute download URLs
 *     [--notes-file <md>] # advisor-facing release notes (docs/release-notes/<v>.md);
 *                         # becomes the manifest "notes" the desktop client shows
 *
 * Fails loudly (exit 1): missing artifact, missing/empty signature, invalid
 * tag, or unknown distribution. (Upstream once shipped empty signatures in a
 * live manifest and broke every client — do not weaken these checks.)
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// dist key → Tauri productName; dist key → manifest file stem.
// Artifact naming = Tauri v2 defaults; verified against real output during
// the rehearsal run (plan Task 10). Do not widen these into loose globs.
const PRODUCT_BY_DIST = { base: "Aside", bilin: "Bilin" };
const MANIFEST_STEM_BY_DIST = { base: "aside", bilin: "bilin" };

// Fallback when a release has no curated notes. The desktop client detects this
// exact string and shows a Chinese "open the changelog" hint instead of raw
// English, so keep it verbatim.
const DEFAULT_NOTES = "See the release page for details.";

function fail(message) {
  throw new Error(`gen-update-manifests: ${message}`);
}

/**
 * Turn a `docs/release-notes/<version>.md` file into manifest `notes`.
 *
 * The file's H1 is the changelog page title, not part of "what changed", and
 * the desktop dialog renders the version in its own title — so the H1 is
 * dropped and the rest (blockquote date + `## 新增/优化/修复` sections) is what
 * ships to clients. Returns "" when nothing but a title remains, which the
 * caller treats as "no curated notes".
 */
export function extractNotesBody(markdown) {
  const text = String(markdown ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return "";
  const lines = text.split("\n");
  if (/^#\s+\S/.test(lines[0].trim())) lines.shift();
  return lines.join("\n").trim();
}

function updaterEntries(product, version) {
  return [
    ["darwin-aarch64", `${product}_${version}_aarch64.app.tar.gz`],
    ["darwin-x86_64", `${product}_${version}_x64.app.tar.gz`],
    ["windows-x86_64", `${product}_${version}_x64-setup.exe`],
  ];
}

function indexArtifacts(dir) {
  if (!fs.existsSync(dir)) fail(`artifacts dir not found: ${dir}`);
  const byName = new Map();
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (!byName.has(entry.name)) byName.set(entry.name, p);
    }
  })(dir);
  return byName;
}

export function buildManifest({
  dist,
  version,
  artifacts,
  downloadBase,
  notes = DEFAULT_NOTES,
}) {
  const product = PRODUCT_BY_DIST[dist];
  if (!product) fail(`unknown distribution "${dist}"`);
  const platforms = {};
  for (const [platformKey, file] of updaterEntries(product, version)) {
    if (!artifacts.has(file)) fail(`missing updater artifact for ${platformKey}: ${file}`);
    const sigPath = `${artifacts.get(file)}.sig`;
    if (!fs.existsSync(sigPath)) {
      fail(`missing signature file: ${path.basename(sigPath)} (for ${file})`);
    }
    const signature = fs.readFileSync(sigPath, "utf8").trim();
    if (!signature) fail(`empty signature in ${path.basename(sigPath)}`);
    platforms[platformKey] = { signature, url: `${downloadBase}/${file}` };
  }
  return {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms,
  };
}

export function generateManifests({
  artifactsDir,
  outDir,
  tag,
  dists,
  repo,
  notes = DEFAULT_NOTES,
  proxy = "https://9dok5otstde5w.sina.dev/",
}) {
  if (!/^v\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(tag || "")) fail(`invalid tag: ${tag}`);
  if (!repo) fail(`invalid repo: ${repo}`);
  const version = tag.slice(1);
  const artifacts = indexArtifacts(artifactsDir);
  const prefix = proxy ? (proxy.endsWith("/") ? proxy : `${proxy}/`) : "";
  const downloadBase = `${prefix}https://github.com/${repo}/releases/download/${tag}`;
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const dist of dists) {
    const manifest = buildManifest({
      dist,
      version,
      artifacts,
      downloadBase,
      notes,
    });
    const json = JSON.stringify(manifest, null, 2) + "\n";
    JSON.parse(json); // round-trip guard before anything leaves this script
    const outPath = path.join(outDir, `latest-${MANIFEST_STEM_BY_DIST[dist]}.json`);
    fs.writeFileSync(outPath, json, "utf8");
    written.push(outPath);
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const get = (flag) => {
    const i = process.argv.indexOf(flag);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  try {
    const opts = {
      artifactsDir: get("--artifacts"),
      outDir: get("--out"),
      tag: get("--tag"),
      repo: get("--repo"),
      proxy: get("--proxy"),
      dists: (get("--dist") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    };
    const notesFile = get("--notes-file");
    if (notesFile !== undefined) {
      if (!fs.existsSync(notesFile)) fail(`notes file not found: ${notesFile}`);
      const body = extractNotesBody(fs.readFileSync(notesFile, "utf8"));
      if (!body) fail(`notes file has no content beyond its title: ${notesFile}`);
      opts.notes = body;
    } else if (get("--notes") !== undefined) {
      const body = extractNotesBody(get("--notes"));
      if (!body) fail("--notes has no content");
      opts.notes = body;
    }
    if (!opts.dists.length) fail("missing required option --dist");
    for (const f of generateManifests(opts)) process.stdout.write(`wrote ${f}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
