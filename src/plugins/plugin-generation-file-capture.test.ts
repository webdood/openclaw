import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { ensurePluginDependencyLink } from "./plugin-generation-file-capture.js";

const temp = useAutoCleanupTempDirTracker(afterEach);
afterEach(() => {
  vi.restoreAllMocks();
});

it("keeps a dependency link whose captured target is not materialized yet", () => {
  const fixture = temp.make("plugin-dependency-link-");
  const target = path.join(fixture, "captures", "package-1", "node_modules", "dep");
  const link = path.join(fixture, "captures", "package-2", "node_modules", "dep");
  const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => {});

  expect(ensurePluginDependencyLink(link, target)).toBe(true);
  // The deferred copy has not run: existsSync() follows the junction and reports it absent,
  // which is exactly where the former guard let symlinkSync() throw EEXIST.
  expect(fs.existsSync(link)).toBe(false);
  expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  expect(() => ensurePluginDependencyLink(link, target)).not.toThrow();
  expect(ensurePluginDependencyLink(link, target)).toBe(false);
  expect(warn).not.toHaveBeenCalled();

  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "package.json"), '{"name":"dep"}');
  expect(fs.readFileSync(path.join(link, "package.json"), "utf8")).toBe('{"name":"dep"}');
  expect(ensurePluginDependencyLink(link, target)).toBe(false);
});

it("replaces a dependency link that points elsewhere and leaves real directories alone", () => {
  const fixture = temp.make("plugin-dependency-link-");
  const stale = path.join(fixture, "stale");
  const target = path.join(fixture, "target");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "marker"), "target");
  const link = path.join(fixture, "node_modules", "dep");
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(stale, link, "junction");
  const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => {});

  expect(ensurePluginDependencyLink(link, target)).toBe(true);
  expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  expect(fs.readFileSync(path.join(link, "marker"), "utf8")).toBe("target");
  expect(warn).toHaveBeenCalledTimes(1);

  const real = path.join(fixture, "node_modules", "real");
  fs.mkdirSync(real);
  expect(ensurePluginDependencyLink(real, target)).toBe(false);
  expect(fs.lstatSync(real).isDirectory()).toBe(true);
  expect(fs.lstatSync(real).isSymbolicLink()).toBe(false);
});
