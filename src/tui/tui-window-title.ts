// Reflects the selected session's name in the terminal's window title.
//
// `/name <title>` is handled by the gateway, which broadcasts `sessions.changed`
// carrying the new `label` (see gateway/session-event-payload.ts). The TUI turns
// that into an OSC 0 write so the terminal's title frame - and therefore the
// taskbar/tab entry - tracks the session name.

const TITLE_MAX_LENGTH = 256;
const BASE_TITLE = "OpenClaw";

/** ESC (0x1b). Built from a code point to keep control bytes out of source. */
const ESC = String.fromCharCode(0x1b);
/** BEL (0x07), the OSC string terminator accepted by every target terminal. */
const BEL = String.fromCharCode(0x07);

/** Set once we have written a title, so exit can restore the terminal. */
let exitHookRegistered = false;
/** Last title actually written, to avoid re-emitting escapes on every event. */
let lastWrittenTitle: string | null = null;

/** C0 controls, DEL, and C1 controls - none may reach an OSC string. */
function isControlCodePoint(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

/**
 * Remove anything that could terminate or inject an escape sequence.
 *
 * Session labels are user-supplied. A label containing BEL or ESC would close
 * the OSC string early and let the remainder be interpreted as terminal
 * commands, so controls are replaced rather than trusted. Filtering by code
 * point keeps literal control characters out of this source file.
 */
function sanitizeWindowTitle(raw: string): string {
  let out = "";
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    out += isControlCodePoint(code) ? " " : char;
  }
  const collapsed = out.replace(/\s+/g, " ").trim();
  return collapsed.length > TITLE_MAX_LENGTH
    ? collapsed.slice(0, TITLE_MAX_LENGTH).trim()
    : collapsed;
}

/** Compose the window title for a session label. */
export function formatTuiWindowTitle(label?: string | null): string {
  const cleaned = typeof label === "string" ? sanitizeWindowTitle(label) : "";
  return cleaned ? `${BASE_TITLE} - ${cleaned}` : BASE_TITLE;
}

/** True when we can emit terminal escapes at all. */
function canWriteWindowTitle(): boolean {
  return Boolean(process.stdout?.isTTY);
}

function writeWindowTitle(title: string): void {
  // OSC 0 sets both the icon name and the window title, which is the most
  // widely supported form across Windows Terminal, conhost, and xterm-likes.
  process.stdout.write(`${ESC}]0;${title}${BEL}`);
}

/**
 * Restore the terminal title on exit so a renamed window does not outlive the
 * TUI. Terminals that ignore an empty title simply keep their own default.
 */
function registerTitleResetOnExit(): void {
  if (exitHookRegistered) {
    return;
  }
  exitHookRegistered = true;
  process.once("exit", () => {
    if (lastWrittenTitle !== null && canWriteWindowTitle()) {
      writeWindowTitle("");
      lastWrittenTitle = null;
    }
  });
}

/**
 * Point the terminal window title at a session label.
 *
 * Returns true when a write happened. No-ops when stdout is not a TTY or the
 * title is already correct, so this is safe to call on every session event.
 */
export function setTuiWindowTitle(label?: string | null): boolean {
  if (!canWriteWindowTitle()) {
    return false;
  }
  const title = formatTuiWindowTitle(label);
  if (title === lastWrittenTitle) {
    return false;
  }
  registerTitleResetOnExit();
  writeWindowTitle(title);
  lastWrittenTitle = title;
  return true;
}

/** Test seam: forget the cached title so the next set always writes. */
export function resetTuiWindowTitleCacheForTests(): void {
  lastWrittenTitle = null;
}
