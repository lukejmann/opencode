import { describe, expect, test } from "bun:test"
import { jsonSchema, tool } from "ai"
import { Effect } from "effect"
import type { Hooks, Observation as ObservationEvent } from "@opencode-ai/plugin"
import { Plugin } from "@/plugin"
import { Observation } from "@/plugin/observation"

const event: ObservationEvent = {
  type: "provider.request",
  sessionID: "session-1",
  messageID: "message-1",
  runtime: "ai-sdk",
  providerID: "openai",
  modelID: "gpt-test",
  system: ["system"],
  messages: [{ role: "user", content: "hello" }],
  tools: [],
  parameters: {},
}

describe("plugin observation", () => {
  test("isolates mutation and hook failures from later observers", async () => {
    const received: ObservationEvent[] = []
    const hooks: Hooks[] = [
      {
        "experimental.observation": async (input) => {
          if (input.type !== "provider.request") throw new Error("unexpected observation")
          ;(input.messages[0] as { content: string }).content = "mutated"
        },
      },
      {
        "experimental.observation": async () => {
          throw new Error("observer failed")
        },
      },
      {
        "experimental.observation": async (input) => {
          received.push(input)
        },
      },
    ]
    const plugin: Pick<Plugin.Interface, "list"> = {
      list: () => Effect.succeed(hooks),
    }

    await Effect.runPromise(Plugin.observe(plugin, event))

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual(event)
    expect((event.messages[0] as { content: string }).content).toBe("hello")
    expect(Object.isFrozen(received[0])).toBe(true)
    if (received[0]?.type !== "provider.request") throw new Error("unexpected observation")
    expect(Object.isFrozen(received[0].messages)).toBe(true)
  })

  test("redacts absolute paths, URL credentials, and secret-bearing config blocks", () => {
    expect(Observation.source("/repo/packages/app/AGENTS.md", "/repo")).toEqual({
      type: "workspace",
      path: "packages/app/AGENTS.md",
    })
    expect(Observation.source("/tmp/project/AGENTS.md", "/", "/tmp/project")).toEqual({
      type: "workspace",
      path: "AGENTS.md",
    })
    expect(Observation.source("/Users/alice/.config/opencode/AGENTS.md", "/repo")).toEqual({
      type: "external",
      name: "AGENTS.md",
    })
    expect(Observation.remoteSource("https://user:pass@example.test/rules?token=secret#fragment")).toEqual({
      type: "remote",
      url: "https://example.test/rules",
    })

    const config = Observation.safeConfig({
      model: "openai/gpt-test",
      enabled_providers: ["openai"],
      instructions: ["/Users/alice/private/AGENTS.md"],
      provider: {
        openai: {
          options: { apiKey: "api-key-secret" },
          headers: { Authorization: "Bearer header-secret" },
        },
      },
      mcp: {
        docs: {
          type: "remote",
          enabled: true,
          url: "https://example.test/mcp?token=mcp-secret",
          headers: { Authorization: "Bearer mcp-header-secret" },
        },
      },
      plugin_origins: [{ path: "/Users/alice/private/plugin.ts" }],
    })
    expect(config).toEqual({
      model: "openai/gpt-test",
      enabled_providers: ["openai"],
      mcp: { docs: { type: "remote", enabled: true } },
    })
    const serialized = JSON.stringify(config)
    expect(serialized).not.toContain("secret")
    expect(serialized).not.toContain("/Users/")
    expect(serialized).not.toContain("Authorization")
  })

  test("captures resolved tool schemas without execute functions or request credentials", () => {
    const request = Observation.providerRequest({
      sessionID: "session-1",
      messageID: "message-1",
      runtime: "native",
      providerID: "openai",
      modelID: "gpt-test",
      system: ["system"],
      messages: [{ role: "user", content: "hello" }],
      tools: {
        lookup: tool({
          description: "Look up a value",
          inputSchema: jsonSchema({
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          }),
          execute: async () => ({ output: "executor-secret" }),
        }),
      },
      parameters: { temperature: 0.2, maxOutputTokens: 1_024 },
    })

    expect(request.tools).toEqual([
      {
        name: "lookup",
        description: "Look up a value",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    ])
    expect(JSON.stringify(request)).not.toContain("executor-secret")
    expect(request.parameters).toEqual({ temperature: 0.2, maxOutputTokens: 1_024 })
    expect(JSON.stringify(request)).not.toContain("headers")
    expect(JSON.stringify(request)).not.toContain("apiKey")
  })
})
