import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { detectProject } from "../dist/project.js";

function tempRoot() {
  return mkdtempSync(join(tmpdir(), "hours-project-"));
}

test("a subdirectory of a repo reports the repo name and branch", () => {
  const root = tempRoot();
  mkdirSync(join(root, "alpha", ".git"), { recursive: true });
  mkdirSync(join(root, "alpha", "src", "deep"), { recursive: true });
  writeFileSync(join(root, "alpha", ".git", "HEAD"), "ref: refs/heads/feat/thing\n");
  assert.deepEqual(detectProject(join(root, "alpha", "src", "deep")), {
    project: "alpha",
    branch: "feat/thing",
  });
});

test("a worktree reports the main repo's name and its own branch", () => {
  const root = tempRoot();
  const wtGit = join(root, "alpha", ".git", "worktrees", "wt1");
  mkdirSync(wtGit, { recursive: true });
  writeFileSync(join(wtGit, "commondir"), "../..\n");
  writeFileSync(join(wtGit, "HEAD"), "ref: refs/heads/fix-1\n");
  mkdirSync(join(root, "alpha-wt1"));
  writeFileSync(join(root, "alpha-wt1", ".git"), `gitdir: ${wtGit}\n`);
  assert.deepEqual(detectProject(join(root, "alpha-wt1")), { project: "alpha", branch: "fix-1" });
});

test("a detached HEAD reports the short commit", () => {
  const root = tempRoot();
  mkdirSync(join(root, "beta", ".git"), { recursive: true });
  writeFileSync(join(root, "beta", ".git", "HEAD"), "0123456789abcdef\n");
  assert.deepEqual(detectProject(join(root, "beta")), { project: "beta", branch: "0123456" });
});

test("outside any repo the directory name is the project", () => {
  const root = tempRoot();
  mkdirSync(join(root, "gamma"));
  assert.equal(detectProject(join(root, "gamma")).project, "gamma");
});

test("a worktree of a bare repo reports the bare repo's name", () => {
  const root = tempRoot();
  const wtGit = join(root, "code", "alpha.git", "worktrees", "main");
  mkdirSync(wtGit, { recursive: true });
  writeFileSync(join(wtGit, "commondir"), "../..\n");
  writeFileSync(join(wtGit, "HEAD"), "ref: refs/heads/main\n");
  mkdirSync(join(root, "code", "alpha-main"));
  writeFileSync(join(root, "code", "alpha-main", ".git"), `gitdir: ${wtGit}\n`);
  assert.deepEqual(detectProject(join(root, "code", "alpha-main")), {
    project: "alpha",
    branch: "main",
  });
});

test("a submodule reports its own name, not the parent's modules folder", () => {
  const root = tempRoot();
  const modGit = join(root, "parent", ".git", "modules", "beta");
  mkdirSync(modGit, { recursive: true });
  writeFileSync(join(modGit, "HEAD"), "ref: refs/heads/main\n");
  mkdirSync(join(root, "parent", "beta"));
  writeFileSync(join(root, "parent", "beta", ".git"), "gitdir: ../.git/modules/beta\n");
  assert.deepEqual(detectProject(join(root, "parent", "beta")), {
    project: "beta",
    branch: "main",
  });
});
