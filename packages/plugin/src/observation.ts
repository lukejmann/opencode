/**
 * Read-only runtime facts emitted at boundaries where OpenCode owns the exact
 * request, environment material, or lineage transition. Observation hooks may
 * copy these values, but cannot change OpenCode execution. Source metadata is
 * sanitized; provider-visible content remains verbatim by design.
 */

export type ObservationSource =
  | {
      readonly type: "workspace"
      /** POSIX-style path relative to the workspace root. */
      readonly path: string
    }
  | {
      readonly type: "external"
      /** A non-sensitive display name. Absolute host paths are never exposed. */
      readonly name: string
    }
  | {
      readonly type: "remote"
      /** URL with credentials, query, and fragment removed. */
      readonly url: string
    }
  | {
      readonly type: "generated"
      readonly name: string
    }

export type ProviderRequestTool = {
  readonly name: string
  readonly description?: string
  readonly inputSchema: unknown
  readonly strict?: boolean
}

export type ProviderRequestObservation = {
  readonly type: "provider.request"
  readonly sessionID: string
  readonly messageID: string
  readonly assistantMessageID?: string
  readonly parentSessionID?: string
  readonly runtime: "ai-sdk" | "native"
  readonly providerID: string
  readonly modelID: string
  readonly system: readonly string[]
  /** Final ordered messages after OpenCode's provider transform. */
  readonly messages: readonly unknown[]
  /** Resolved tool definitions only. Execute functions are never exposed. */
  readonly tools: readonly ProviderRequestTool[]
  readonly toolChoice?: "auto" | "required" | "none"
  readonly parameters: {
    readonly temperature?: number
    readonly topP?: number
    readonly topK?: number
    readonly maxOutputTokens?: number
  }
}

export type ProviderResponseObservation = {
  readonly type: "provider.response"
  readonly sessionID: string
  readonly messageID: string
  readonly parentMessageID: string
  readonly providerID: string
  readonly modelID: string
  readonly status: "ok" | "error" | "cancelled"
  /** Final OpenCode-owned message parts for this provider step. */
  readonly parts: readonly unknown[]
  readonly usage: {
    readonly input?: number
    readonly output?: number
    readonly reasoning?: number
    readonly cacheRead?: number
    readonly cacheWrite?: number
  }
}

export type EnvironmentMaterialKind = "configuration" | "instruction" | "skill" | "mcp" | "model" | "agent"

export type EnvironmentMaterialObservation = {
  readonly type: "environment.material"
  readonly sessionID?: string
  readonly messageID?: string
  readonly assistantMessageID?: string
  readonly material: {
    readonly kind: EnvironmentMaterialKind
    /** Stable, human-readable identity. This is not a content hash. */
    readonly id: string
    readonly source?: ObservationSource
    readonly content: unknown
  }
}

export type McpLifecycleObservation = {
  readonly type: "mcp.lifecycle"
  readonly phase: "attached" | "detached"
  readonly sessionID: string
  readonly messageID: string
  readonly assistantMessageID: string
  readonly serverID: string
  /** Whether this server contributes instructions or tools to this provider request. */
  readonly included: boolean
  readonly instructions?: string
  /** Exact provider-visible MCP tool identities and input schemas. */
  readonly tools: readonly {
    readonly name: string
    readonly providerName: string
    readonly description?: string
    readonly inputSchema: unknown
  }[]
}

export type CompactionObservation = {
  readonly type: "session.compaction"
  readonly phase: "started" | "completed" | "failed"
  readonly sessionID: string
  readonly compactionMessageID: string
  readonly summaryMessageID: string
  readonly sourceMessageID?: string
  readonly inputMessageIDs: readonly string[]
  readonly retainedTailMessageID?: string
  readonly automatic: boolean
  readonly overflow: boolean
}

export type SubagentObservation = {
  readonly type: "session.subagent"
  readonly phase: "started" | "completed" | "failed" | "cancelled"
  readonly action: "spawn" | "resume"
  readonly parentSessionID: string
  readonly childSessionID: string
  readonly parentMessageID: string
  readonly childPromptMessageID: string
  readonly childResultMessageID?: string
  readonly toolCallID?: string
  readonly agent: string
  readonly background: boolean
}

export type Observation =
  | ProviderRequestObservation
  | ProviderResponseObservation
  | EnvironmentMaterialObservation
  | McpLifecycleObservation
  | CompactionObservation
  | SubagentObservation
