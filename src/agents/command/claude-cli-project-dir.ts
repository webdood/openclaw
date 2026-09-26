/**
 * Resolves Claude CLI project storage directories for OpenClaw workspaces.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";

const CLAUDE_PROJECTS_DIRNAME = "projects";
const MAX_SANITIZED_PROJECT_LENGTH = 200;

// Claude CLI stores project state under a sanitized workspace key. Add a stable
// hash when the key is truncated so long paths do not collide silently.
function simpleHash36(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function sanitizeClaudeCliProjectKey(workspaceDir: string): string {
  const sanitized = workspaceDir.replace(/[^a-zA-Z0-9]/g, "-");
  if (sanitized.length <= MAX_SANITIZED_PROJECT_LENGTH) {
    return sanitized;
  }
  return `${sanitized.slice(0, MAX_SANITIZED_PROJECT_LENGTH)}-${simpleHash36(workspaceDir)}`;
}

// Claude CLI keys project state on the cwd it observes. POSIX kernels hand a
// process the resolved cwd, so symlinked workspaces share one canonical key.
// Windows keeps the spelling the process was given (junctions and case
// included), so the key must use the same spelling OpenClaw passes as cwd.
function canonicalizeWorkspaceDir(workspaceDir: string): string {
  const resolved = path.resolve(workspaceDir).normalize("NFC");
  if (process.platform === "win32") {
    return resolved;
  }
  try {
    return fs.realpathSync.native(resolved).normalize("NFC");
  } catch {
    return resolved;
  }
}

// Claude CLI relocates its whole config tree, including projects/, when
// CLAUDE_CONFIG_DIR is set; `~/.claude` is only the default.
function resolveClaudeConfigDir(homeDir: string, env: NodeJS.ProcessEnv): string {
  const configured = normalizeOptionalString(env.CLAUDE_CONFIG_DIR);
  return configured ? path.resolve(configured) : path.join(homeDir, ".claude");
}

/** Resolves Claude CLI's per-workspace project directory. */
export function resolveClaudeCliProjectDirForWorkspace(params: {
  workspaceDir: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = params.env ?? process.env;
  const homeDir = normalizeOptionalString(params.homeDir) || env.HOME || os.homedir();
  const canonicalWorkspaceDir = canonicalizeWorkspaceDir(params.workspaceDir);
  return path.join(
    resolveClaudeConfigDir(homeDir, env),
    CLAUDE_PROJECTS_DIRNAME,
    sanitizeClaudeCliProjectKey(canonicalWorkspaceDir),
  );
}
