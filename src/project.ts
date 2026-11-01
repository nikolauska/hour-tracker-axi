import { readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export interface ProjectInfo {
  project: string;
  branch?: string;
}

// Reads .git directly instead of running `git`: hooks fire on every tool call and a
// subprocess per call is the most expensive part of recording an event.
export function detectProject(cwd: string): ProjectInfo {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const info = fromGitEntry(dir);
    if (info) return info;
    if (dirname(dir) === dir) return { project: basename(resolve(cwd)) || "unknown" };
  }
}

function fromGitEntry(dir: string): ProjectInfo | undefined {
  const dotGit = join(dir, ".git");
  let isFile: boolean;
  try {
    isFile = statSync(dotGit).isFile();
  } catch {
    return undefined;
  }
  if (!isFile) return { project: basename(dir), branch: readBranch(dotGit) };

  // A worktree's .git is a file pointing into the main repo; name the project after the
  // main repo so all worktrees of one codebase report as the same project.
  const match = /^gitdir:\s*(.+)$/m.exec(safeRead(dotGit) ?? "");
  if (!match) return { project: basename(dir) };
  const gitDir = isAbsolute(match[1].trim()) ? match[1].trim() : resolve(dir, match[1].trim());
  const common = safeRead(join(gitDir, "commondir"))?.trim();
  // No commondir means a submodule or --separate-git-dir checkout: the directory is the repo.
  if (!common) return { project: basename(dir), branch: readBranch(gitDir) };
  return { project: repoName(resolve(gitDir, common)), branch: readBranch(gitDir) };
}

// A normal repo keeps its git dir at <repo>/.git, a bare repo is <repo>.git or a hidden
// <repo>/.bare, and a submodule's is .git/modules/<name>; all should report as <repo>/<name>.
function repoName(gitDir: string): string {
  const name = basename(gitDir);
  return name.startsWith(".") ? basename(dirname(gitDir)) : name.replace(/\.git$/, "");
}

function readBranch(gitDir: string): string | undefined {
  const head = safeRead(join(gitDir, "HEAD"))?.trim();
  if (!head) return undefined;
  const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
  return ref ? ref[1] : head.slice(0, 7);
}

function safeRead(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}
