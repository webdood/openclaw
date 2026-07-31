import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TuiStateAccess } from "./tui-types.js";
import {
  formatTuiWindowTitle,
  resetTuiWindowTitleCacheForTests,
  setTuiWindowTitle,
  syncTuiWindowTitleForSelectedSession,
  syncTuiWindowTitleFromSessionEvent,
} from "./tui-window-title.js";

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

describe("formatTuiWindowTitle", () => {
  it("falls back to the base title without a label", () => {
    expect(formatTuiWindowTitle(undefined)).toBe("OpenClaw");
    expect(formatTuiWindowTitle(null)).toBe("OpenClaw");
    expect(formatTuiWindowTitle("")).toBe("OpenClaw");
    expect(formatTuiWindowTitle("   ")).toBe("OpenClaw");
  });

  it("appends the session label", () => {
    expect(formatTuiWindowTitle("foo")).toBe("OpenClaw - foo");
  });

  it("keeps ordinary punctuation intact", () => {
    expect(formatTuiWindowTitle("TDAE-042: tax deeds (v2)")).toBe(
      "OpenClaw - TDAE-042: tax deeds (v2)",
    );
  });

  it("strips control characters so a label cannot close the OSC string", () => {
    expect(formatTuiWindowTitle(`foo${BEL}rm -rf /`)).toBe("OpenClaw - foo rm -rf /");
    expect(formatTuiWindowTitle(`foo${ESC}]0;evil`)).toBe("OpenClaw - foo ]0;evil");
  });

  it("collapses whitespace introduced by stripping", () => {
    expect(formatTuiWindowTitle("a\t\tb")).toBe("OpenClaw - a b");
  });

  it("truncates absurdly long labels", () => {
    const title = formatTuiWindowTitle("x".repeat(500));
    expect(title.length).toBeLessThanOrEqual("OpenClaw - ".length + 256);
  });
});

describe("setTuiWindowTitle", () => {
  let writes: string[];
  let write: ReturnType<typeof vi.spyOn>;
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    resetTuiWindowTitleCacheForTests();
    writes = [];
    process.stdout.isTTY = true;
    write = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    write.mockRestore();
    process.stdout.isTTY = originalIsTTY;
  });

  it("emits an OSC 0 sequence for the label", () => {
    expect(setTuiWindowTitle("foo")).toBe(true);
    expect(writes).toEqual([`${ESC}]0;OpenClaw - foo${BEL}`]);
  });

  it("does not rewrite an unchanged title", () => {
    expect(setTuiWindowTitle("foo")).toBe(true);
    expect(setTuiWindowTitle("foo")).toBe(false);
    expect(writes).toHaveLength(1);
  });

  it("writes again when the label actually changes", () => {
    setTuiWindowTitle("foo");
    expect(setTuiWindowTitle("bar")).toBe(true);
    expect(writes).toEqual([`${ESC}]0;OpenClaw - foo${BEL}`, `${ESC}]0;OpenClaw - bar${BEL}`]);
  });

  it("returns to the base title when a label is cleared", () => {
    setTuiWindowTitle("foo");
    expect(setTuiWindowTitle(null)).toBe(true);
    expect(writes[1]).toBe(`${ESC}]0;OpenClaw${BEL}`);
  });

  it("stays silent when stdout is not a TTY", () => {
    process.stdout.isTTY = false;
    expect(setTuiWindowTitle("foo")).toBe(false);
    expect(writes).toHaveLength(0);
  });

  describe("syncTuiWindowTitleFromSessionEvent", () => {
    it("retitles from an event label", () => {
      expect(syncTuiWindowTitleFromSessionEvent({ label: "foo" })).toBe(true);
      expect(writes).toEqual([`${ESC}]0;OpenClaw - foo${BEL}`]);
    });

    it("ignores an absent label so an unrelated event cannot reset the title", () => {
      setTuiWindowTitle("foo");
      writes.length = 0;
      expect(syncTuiWindowTitleFromSessionEvent({})).toBe(false);
      expect(writes).toHaveLength(0);
    });

    it("treats an explicit null as a cleared label", () => {
      setTuiWindowTitle("foo");
      writes.length = 0;
      expect(syncTuiWindowTitleFromSessionEvent({ label: null })).toBe(true);
      expect(writes).toEqual([`${ESC}]0;OpenClaw${BEL}`]);
    });
  });

  describe("syncTuiWindowTitleForSelectedSession", () => {
    const state = {
      currentSessionKey: "agent:main:telegram:direct:7271991700",
      currentAgentId: "main",
      agentDefaultId: "main",
      currentSessionId: null,
    } as unknown as TuiStateAccess;

    it("retitles for the selected session", () => {
      expect(
        syncTuiWindowTitleForSelectedSession(state, {
          sessionKey: "agent:main:telegram:direct:7271991700",
          label: "foo",
        }),
      ).toBe(true);
      expect(writes).toEqual([`${ESC}]0;OpenClaw - foo${BEL}`]);
    });

    it("ignores a rename of a different session", () => {
      expect(
        syncTuiWindowTitleForSelectedSession(state, {
          sessionKey: "agent:main:whatsapp:direct:+16502005044",
          label: "someone else",
        }),
      ).toBe(false);
      expect(writes).toHaveLength(0);
    });

    it("ignores payloads that are not objects", () => {
      expect(syncTuiWindowTitleForSelectedSession(state, undefined)).toBe(false);
      expect(syncTuiWindowTitleForSelectedSession(state, "nope")).toBe(false);
      expect(writes).toHaveLength(0);
    });
  });
});
