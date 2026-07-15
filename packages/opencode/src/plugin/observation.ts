import path from "node:path"
import { asSchema, type ModelMessage, type Tool } from "ai"
import type {
  Observation as PluginObservation,
  ObservationSource,
  ProviderRequestObservation,
  ProviderRequestTool,
} from "@opencode-ai/plugin"
import { isRecord } from "@/util/record"

function freeze(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object") return
  if (ArrayBuffer.isView(value)) return
  if (seen.has(value)) return
  seen.add(value)
  for (const item of Object.values(value)) freeze(item, seen)
  Object.freeze(value)
}

/** Clone before every hook so observers never receive live runtime objects. */
export function snapshot(input: PluginObservation): PluginObservation {
  const result = structuredClone(input)
  freeze(result)
  return result
}

function relativeTo(root: string, target: string) {
  const result = path.relative(path.resolve(root), path.resolve(target))
  if (result === "") return "."
  if (result === ".." || result.startsWith(`..${path.sep}`) || path.isAbsolute(result)) return
  return result.split(path.sep).join("/")
}

/** Convert a host path to a workspace-relative or basename-only source. */
export function source(filepath: string, worktree: string, directory = worktree): ObservationSource {
  const roots = [worktree, directory]
    .map((item) => path.resolve(item))
    .filter((item, index, all) => item !== path.parse(item).root && all.indexOf(item) === index)
  for (const root of roots) {
    const relative = relativeTo(root, filepath)
    if (relative) return { type: "workspace", path: relative }
  }
  return { type: "external", name: path.basename(filepath) || "external" }
}

/** Remove URL components that commonly carry credentials or signed secrets. */
export function remoteSource(value: string): ObservationSource {
  try {
    const url = new URL(value)
    url.username = ""
    url.password = ""
    url.search = ""
    url.hash = ""
    return { type: "remote", url: url.toString() }
  } catch {
    return { type: "external", name: "remote-instruction" }
  }
}

function copyScalar(target: Record<string, unknown>, input: Record<string, unknown>, key: string) {
  const value = input[key]
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") target[key] = value
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined
}

function safeCompaction(value: unknown) {
  if (!isRecord(value)) return
  const result: Record<string, unknown> = {}
  for (const key of ["auto", "prune", "tail_turns", "preserve_recent_tokens", "reserved"]) {
    copyScalar(result, value, key)
  }
  return Object.keys(result).length ? result : undefined
}

function safeMcp(value: unknown) {
  if (!isRecord(value)) return
  return Object.fromEntries(
    Object.entries(value).map(([name, item]) => {
      if (typeof item === "boolean") return [name, { enabled: item }]
      if (!isRecord(item)) return [name, {}]
      const safe: Record<string, unknown> = {}
      copyScalar(safe, item, "type")
      copyScalar(safe, item, "enabled")
      copyScalar(safe, item, "timeout")
      return [name, safe]
    }),
  )
}

function safeAgents(value: unknown) {
  if (!isRecord(value)) return
  return Object.fromEntries(
    Object.entries(value).map(([name, item]) => {
      if (!isRecord(item)) return [name, {}]
      const safe: Record<string, unknown> = {}
      copyScalar(safe, item, "mode")
      copyScalar(safe, item, "model")
      copyScalar(safe, item, "hidden")
      copyScalar(safe, item, "steps")
      return [name, safe]
    }),
  )
}

/**
 * An intentionally allowlisted view of effective config. Provider blocks,
 * headers, environment values, commands, URLs, auth, and plugin paths are not
 * copied even when present in the resolved configuration.
 */
export function safeConfig(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return {}
  const result: Record<string, unknown> = {}
  for (const key of ["model", "small_model", "default_agent", "share", "autoupdate", "snapshot"]) {
    copyScalar(result, value, key)
  }
  for (const key of ["enabled_providers", "disabled_providers"]) {
    const list = stringList(value[key])
    if (list) result[key] = list
  }
  if (isRecord(value.tools)) {
    result.tools = Object.fromEntries(
      Object.entries(value.tools).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    )
  }
  const compaction = safeCompaction(value.compaction)
  if (compaction) result.compaction = compaction
  const mcp = safeMcp(value.mcp)
  if (mcp) result.mcp = mcp
  const agents = safeAgents(value.agent)
  if (agents) result.agent = agents
  return result
}

function toolSchema(item: Tool) {
  try {
    return structuredClone(asSchema(item.inputSchema).jsonSchema)
  } catch {
    return { type: "object", properties: {} }
  }
}

export function tools(value: Record<string, Tool>): ProviderRequestTool[] {
  return Object.entries(value)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([name, item]) => ({
      name,
      ...(item.description ? { description: item.description } : {}),
      inputSchema: toolSchema(item),
      ...(typeof item.strict === "boolean" ? { strict: item.strict } : {}),
    }))
}

export function providerRequest(input: {
  sessionID: string
  messageID: string
  assistantMessageID?: string
  parentSessionID?: string
  runtime: ProviderRequestObservation["runtime"]
  providerID: string
  modelID: string
  system: readonly string[]
  messages: readonly ModelMessage[]
  tools: Record<string, Tool>
  toolChoice?: ProviderRequestObservation["toolChoice"]
  parameters: ProviderRequestObservation["parameters"]
}): ProviderRequestObservation {
  return {
    type: "provider.request",
    sessionID: input.sessionID,
    messageID: input.messageID,
    assistantMessageID: input.assistantMessageID,
    parentSessionID: input.parentSessionID,
    runtime: input.runtime,
    providerID: input.providerID,
    modelID: input.modelID,
    system: [...input.system],
    messages: [...input.messages],
    tools: tools(input.tools),
    toolChoice: input.toolChoice,
    parameters: {
      ...(typeof input.parameters.temperature === "number" ? { temperature: input.parameters.temperature } : {}),
      ...(typeof input.parameters.topP === "number" ? { topP: input.parameters.topP } : {}),
      ...(typeof input.parameters.topK === "number" ? { topK: input.parameters.topK } : {}),
      ...(typeof input.parameters.maxOutputTokens === "number"
        ? { maxOutputTokens: input.parameters.maxOutputTokens }
        : {}),
    },
  }
}

export * as Observation from "./observation"
