import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateManifests } from "./gen-update-manifests.mjs";

const SIG = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZQo=";

function makeArtifacts({ version = "1.4.2", products = ["Aside", "Bilin"], skip = [], emptySig = [], dropSig = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "upd-fix-"));
  const files = (p) => [
    `${p}_${version}_aarch64.app.tar.gz`,
    `${p}_${version}_x64.app.tar.gz`,
    `${p}_${version}_x64-setup.exe`,
  ];
  for (const product of products) {
    for (const file of files(product)) {
      if (skip.includes(file)) continue;
      fs.writeFileSync(path.join(dir, file), "binary");
      if (!dropSig.includes(file)) {
        fs.writeFileSync(`${path.join(dir, file)}.sig`, emptySig.includes(file) ? "  \n" : SIG);
      }
    }
  }
  return dir;
}

function tmpOut() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "upd-out-"));
}

test("generates latest-aside.json and latest-bilin.json with absolute urls and signatures", () => {
  const artifacts = makeArtifacts();
  const out = tmpOut();
  const written = generateManifests({
    artifactsDir: artifacts, outDir: out, tag: "v1.4.2", dists: ["base", "bilin"],
    repo: "forrany/bilin-releases",
  });
  assert.deepEqual(written.map((p) => path.basename(p)), ["latest-aside.json", "latest-bilin.json"]);
  const aside = JSON.parse(fs.readFileSync(path.join(out, "latest-aside.json"), "utf8"));
  assert.equal(aside.version, "1.4.2");
  assert.deepEqual(Object.keys(aside.platforms).sort(),
    ["darwin-aarch64", "darwin-x86_64", "windows-x86_64"]);
  assert.equal(aside.platforms["darwin-aarch64"].signature, SIG);
  assert.equal(aside.platforms["darwin-aarch64"].url,
    "https://9dok5otstde5w.sina.dev/https://github.com/forrany/bilin-releases/releases/download/v1.4.2/Aside_1.4.2_aarch64.app.tar.gz");
  const bilin = JSON.parse(fs.readFileSync(path.join(out, "latest-bilin.json"), "utf8"));
  assert.equal(bilin.platforms["windows-x86_64"].url,
    "https://9dok5otstde5w.sina.dev/https://github.com/forrany/bilin-releases/releases/download/v1.4.2/Bilin_1.4.2_x64-setup.exe");
});

test("subset of distributions writes only its manifest", () => {
  const out = tmpOut();
  const written = generateManifests({
    artifactsDir: makeArtifacts({ products: ["Bilin"] }), outDir: out,
    tag: "v1.4.2", dists: ["bilin"], repo: "forrany/bilin-releases",
  });
  assert.deepEqual(written.map((p) => path.basename(p)), ["latest-bilin.json"]);
});

test("missing updater artifact fails loudly", () => {
  assert.throws(
    () => generateManifests({
      artifactsDir: makeArtifacts({ skip: ["Aside_1.4.2_x64.app.tar.gz"] }),
      outDir: tmpOut(), tag: "v1.4.2", dists: ["base"], repo: "forrany/bilin-releases",
    }),
    /missing updater artifact.*Aside_1\.4\.2_x64\.app\.tar\.gz/,
  );
});

test("missing signature file fails loudly", () => {
  assert.throws(
    () => generateManifests({
      artifactsDir: makeArtifacts({ dropSig: ["Bilin_1.4.2_x64-setup.exe"] }),
      outDir: tmpOut(), tag: "v1.4.2", dists: ["bilin"], repo: "forrany/bilin-releases",
    }),
    /missing signature file.*\.sig/,
  );
});

test("empty signature fails loudly", () => {
  assert.throws(
    () => generateManifests({
      artifactsDir: makeArtifacts({ emptySig: ["Aside_1.4.2_aarch64.app.tar.gz"] }),
      outDir: tmpOut(), tag: "v1.4.2", dists: ["base"], repo: "forrany/bilin-releases",
    }),
    /empty signature/,
  );
});

test("invalid tag fails loudly", () => {
  assert.throws(
    () => generateManifests({
      artifactsDir: makeArtifacts(), outDir: tmpOut(), tag: "notatag",
      dists: ["base"], repo: "forrany/bilin-releases",
    }),
    /invalid tag/,
  );
});
