/**
 * Machine-readable proof that this build carries the audited observation
 * surface. Stock OpenCode builds do not expose this flag, so Agent Engine can
 * select the native bridge only for the pinned fork and retain OTLP elsewhere.
 */
export const AgentEngineCapability = {
  schemaVersion: "agent-engine.opencode-capability.v1",
  auditedSourceCommit: "d6f1b08ce818b494e5ace3d87010bc45dd03bfbf",
  observationApi: "experimental.observation.v1",
  observationTypes: ["provider.request", "provider.response", "session.compaction", "session.subagent"],
  finalProviderMessages: true,
  compactionLineage: true,
  subagentLineage: true,
} as const
