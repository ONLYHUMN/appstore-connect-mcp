import type { AppStoreConnectClient } from './appstore-client.js';

export type ToolResult = { content: { type: 'text'; text: string }[] };

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, unknown>; required?: string[] };
};

export type RegisteredTool = {
  definition: ToolDefinition;
  run: (client: AppStoreConnectClient, args: any) => Promise<unknown>;
};

export function requireConfirm(args: { confirm?: unknown }): void {
  if (args?.confirm !== true) {
    throw new Error('Set confirm to true to run this mutating action.');
  }
}

export function createToolModule(tools: RegisteredTool[]) {
  return {
    definitions: tools.map((tool) => tool.definition),
    async run(
      client: AppStoreConnectClient,
      name: string,
      args: unknown
    ): Promise<ToolResult | null> {
      const tool = tools.find((candidate) => candidate.definition.name === name);
      if (!tool) return null;
      const result = await tool.run(client, args ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  };
}

export const str = (description: string) => ({ type: 'string', description });
export const bool = (description: string) => ({ type: 'boolean', description });
export const num = (description: string) => ({ type: 'number', description });
export const strList = (description: string) => ({
  type: 'array',
  items: { type: 'string' },
  description,
});
