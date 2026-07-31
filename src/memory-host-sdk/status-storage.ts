/**
 * Status-only memory storage metadata. Keep health checks off the full memory
 * backend facade, which also owns runtime config and search implementation exports.
 */
export { MEMORY_INDEX_META_TABLE } from "../../packages/memory-host-sdk/src/host/memory-schema-base.js";
export {
  MEMORY_INDEX_CHUNKS_TABLE,
  MEMORY_INDEX_SOURCES_TABLE,
} from "../../packages/memory-host-sdk/src/host/memory-schema-fts.js";
export type { MemoryProviderStatus } from "../../packages/memory-host-sdk/src/host/types.js";
