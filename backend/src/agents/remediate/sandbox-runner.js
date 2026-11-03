// Isolated sandbox verifier using git worktree.
// Applies a unified diff to a temp worktree, runs lint + tests, returns results.
// Never auto-merges. Max 3 retry loops handled by caller.

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO_ROOT = path.resolve(process.cwd(), '..');

export async function runSandbox(diff, branchName) {
  const worktree = path.join(os.tmpdir(), `sandbox-${Date.now()}`);
  const results = { worktree, applied: false, lint: null, tests: null, error: null };
  try {
    // Create worktree on a new branch
    execSync(`git worktree add -b ${branchName} ${worktree} HEAD`, { cwd: REPO_ROOT, stdio: 'pipe' });
    // Apply diff
    const patchFile = path.join(os.tmpdir(), `patch-${Date.now()}.diff`);
    fs.writeFileSync(patchFile, diff);
    try {
      execSync(`git apply --check ${patchFile}`, { cwd: worktree, stdio: 'pipe' });
      execSync(`git apply ${patchFile}`, { cwd: worktree, stdio: 'pipe' });
      results.applied = true;
    } catch (e) {
      results.error = `Patch apply failed: ${e?.stderr?.toString() || e?.message}`;
      return results;
    }
    // Run lint (best-effort)
    try {
      execSync('npm run lint', { cwd: path.join(worktree, 'backend'), stdio: 'pipe', timeout: 120000 });
      results.lint = 'passed';
    } catch (e) {
      results.lint = `failed: ${e?.stdout?.toString()?.slice(0, 500) || e?.message}`;
    }
    // Run targeted tests
    try {
      execSync('NODE_ENV=test node --test --test-concurrency=1', { cwd: path.join(worktree, 'backend'), stdio: 'pipe', timeout: 300000 });
      results.tests = 'passed';
    } catch (e) {
      results.tests = `failed: ${e?.stdout?.toString()?.slice(0, 500) || e?.message}`;
    }
  } catch (e) {
    results.error = e?.message || String(e);
  } finally {
    // Cleanup worktree
    try { execSync(`git worktree remove --force ${worktree}`, { cwd: REPO_ROOT, stdio: 'pipe' }); } catch {}
    try { execSync(`git branch -D ${branchName}`, { cwd: REPO_ROOT, stdio: 'pipe' }); } catch {}
  }
  return results;
}
EOF
echo done