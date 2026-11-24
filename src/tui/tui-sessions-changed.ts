import type { ChatLogOperations } from "./components/chat-log.js";
import type { createTuiRunLifecycle } from "./tui-run-lifecycle.js";
import { matchesSelectedTuiSession } from "./tui-session-events.js";
import {
  getTuiSessionProjection,
  isIdentityOnlyTuiSessionInvalidation,
  readTuiSessionProjectionScope,
  reduceTuiSessionProjection,
} from "./tui-session-projection.js";
import type { TuiSessionRunCoordinator } from "./tui-session-run-coordinator.js";
import { getPendingSubmitAcceptedRunId } from "./tui-submit-state.js";
import type { SessionChangedEvent } from "./tui-types.js";
import { syncTuiWindowTitleForSelectedSession } from "./tui-window-title.js";

type LifecycleContext = Parameters<typeof createTuiRunLifecycle>[0];

export type SessionsChangedHandlerDeps = Pick<
  LifecycleContext,
  "state" | "tui" | "setActivityStatus" | "refreshSessionInfo"
> & {
  chatLog: Pick<ChatLogOperations, "addSystem">;
  runCoordinator: TuiSessionRunCoordinator;
  flushPendingHistoryRefreshIfIdle: () => void;
  clearTrackedRunState: () => void;
  clearStaleStreamingIfNoTrackedRunRemains: (event?: SessionChangedEvent) => void;
};

/**
 * Builds the `sessions.changed` handler for the TUI. Lifted out of
 * tui-event-handlers.ts so that file stays within its line budget; the
 * closure state it needs arrives through `deps` instead of lexical scope.
 */
export function createSessionsChangedHandler(
  deps: SessionsChangedHandlerDeps,
): (evt: SessionChangedEvent) => void {
  const {
    state,
    tui,
    chatLog,
    setActivityStatus,
    refreshSessionInfo,
    runCoordinator,
    flushPendingHistoryRefreshIfIdle,
    clearTrackedRunState,
    clearStaleStreamingIfNoTrackedRunRemains,
  } = deps;
  const {
    sessionRuns,
    finalizedRunsWithDisplay,
    pendingNewSessionRunIds,
    persistedTerminalRunIds,
  } = runCoordinator;

  return (evt: SessionChangedEvent) => {
    // Retitle before the phase-specific early returns; a rename can land on any phase.
    syncTuiWindowTitleForSelectedSession(state, evt);
    if (!matchesSelectedTuiSession(state, evt, { requireAliasOwnership: true })) {
      return;
    }

    if (evt.phase === "message") {
      const matchesCurrentSessionId =
        typeof evt.sessionId !== "string" ||
        !state.currentSessionId ||
        evt.sessionId === state.currentSessionId;
      if (!matchesCurrentSessionId || !isIdentityOnlyTuiSessionInvalidation(evt)) {
        return;
      }
      // Legacy atomic batches expose no replayable message identity. Refresh
      // their authoritative history without resetting the current run or stream.
      void runCoordinator.queueHistoryReload();
      return;
    }

    const persistedRunId = evt.clientRunId || evt.runId;
    if (persistedRunId && (evt.phase === "end" || evt.phase === "error")) {
      runCoordinator.notePersistedRun(persistedRunId);
      if (
        pendingNewSessionRunIds.delete(persistedRunId) ||
        sessionRuns.has(persistedRunId) ||
        state.activeChatRunId === persistedRunId ||
        getPendingSubmitAcceptedRunId(state) === persistedRunId
      ) {
        if (evt.phase === "end") {
          const displayedRunIds = finalizedRunsWithDisplay.has(persistedRunId)
            ? [persistedRunId]
            : [];
          runCoordinator.pendingHistoryRefresh = false;
          void runCoordinator.queueHistoryReload(
            [persistedRunId],
            [persistedRunId],
            displayedRunIds,
          );
        } else {
          void refreshSessionInfo?.();
        }
      }
      flushPendingHistoryRefreshIfIdle();
      return;
    }
    if (evt.reason !== "new" && evt.reason !== "reset") {
      return clearStaleStreamingIfNoTrackedRunRemains(evt);
    }

    const nextSessionId = typeof evt.sessionId === "string" ? evt.sessionId : null;
    const replacesKnownSession =
      state.currentSessionId !== null &&
      nextSessionId !== null &&
      state.currentSessionId !== nextSessionId;
    if (evt.reason === "new" && !replacesKnownSession) {
      const { runIds, displayedRunIds } = runCoordinator.collectTrackedSessionRunIds();
      if (runIds.size > 0) {
        if (nextSessionId) {
          state.currentSessionId = nextSessionId;
        }
        if (typeof evt.updatedAt === "number" || evt.updatedAt === null) {
          state.sessionInfo.updatedAt = evt.updatedAt;
        }
        const persistedRunIds: string[] = [];
        for (const runId of runIds) {
          if (persistedTerminalRunIds.has(runId)) {
            persistedRunIds.push(runId);
          } else {
            pendingNewSessionRunIds.add(runId);
          }
        }
        void runCoordinator.queueHistoryReload(persistedRunIds, persistedRunIds, displayedRunIds);
        tui.requestRender();
        return;
      }
    }

    const { runIds, finalizedRunIds, displayedRunIds } =
      runCoordinator.collectTrackedSessionRunIds();
    state.sessionGeneration = (state.sessionGeneration ?? 0) + 1;
    // Reduce the old epoch before adopting its replacement ID; otherwise the
    // canonical reducer correctly rejects the reset as a foreign session.
    reduceTuiSessionProjection(state, {
      type: "sessionReset",
      scope: readTuiSessionProjectionScope(state),
    });
    clearTrackedRunState();
    state.activeChatRunId = null;
    state.activityStatus = "idle";
    setActivityStatus("idle");
    if (nextSessionId) {
      state.currentSessionId = nextSessionId;
    }
    if (typeof evt.updatedAt === "number" || evt.updatedAt === null) {
      state.sessionInfo.updatedAt = evt.updatedAt;
    }
    getTuiSessionProjection(state);
    const selection = { sessionKey: state.currentSessionKey, agentId: state.currentAgentId };
    const generation = state.sessionGeneration;
    const historyReload = runCoordinator.queueHistoryReload(
      runIds.size > 0 ? runIds : undefined,
      finalizedRunIds,
      displayedRunIds,
    );
    // The reset event can retire its own RPC acknowledgement. Its authoritative
    // receipt belongs after the last queued history rebuild, which clears chat.
    void historyReload.then((current) => {
      if (
        current &&
        evt.reason === "reset" &&
        generation === state.sessionGeneration &&
        matchesSelectedTuiSession(state, selection) &&
        selection.agentId === state.currentAgentId
      ) {
        chatLog.addSystem(`session ${state.currentSessionKey} reset`);
        tui.requestRender();
      }
    });
    tui.requestRender();
  };
}
