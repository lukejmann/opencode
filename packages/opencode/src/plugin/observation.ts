import { asSchema, type ModelMessage, type Tool } from "ai"
import type {
  Observation as PluginObservation,
  ProviderRequestObservation,
  ProviderRequestTool,
} from "@opencode-ai/plugin"

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
