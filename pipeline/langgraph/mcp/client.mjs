/**
 * MCP client — spawns scout-knowledge server as a stdio subprocess
 * and exposes its tools as OpenAI-compatible schemas for the agent loop.
 *
 * Usage:
 *   const mcp = new ScoutMcpClient(clientSlug);
 *   await mcp.start();
 *   const schemas = mcp.getToolSchemas();   // pass to OpenRouter
 *   const result  = await mcp.callTool(name, args);
 *   await mcp.stop();
 */
import { Client }               from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath }        from 'url';
import path                     from 'path';

const SERVER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs');
const ROOT        = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export class ScoutMcpClient {
  constructor(clientSlug) {
    this.clientSlug  = clientSlug;
    this.client      = null;
    this.transport   = null;
    this._toolSchemas = [];
  }

  async start() {
    this.transport = new StdioClientTransport({
      command: 'node',
      args:    [SERVER_PATH, '--client', this.clientSlug, '--root', ROOT],
      env:     { ...process.env },
    });

    this.client = new Client({ name: 'scout-orchestrator', version: '1.0.0' });
    await this.client.connect(this.transport);

    const { tools } = await this.client.listTools();
    this._toolSchemas = tools.map(t => ({
      type:     'function',
      function: {
        name:        t.name,
        description: t.description,
        parameters:  t.inputSchema,
      },
    }));

    console.error(`[mcp-client] Connected — ${this._toolSchemas.length} tools available`);
    return this;
  }

  /** OpenAI-compatible tool schemas to merge into the agent's tool list */
  getToolSchemas() {
    return this._toolSchemas;
  }

  /**
   * Execute a tool by name via MCP.
   * Returns the text content of the response as a string.
   */
  async callTool(name, args = {}) {
    const result      = await this.client.callTool({ name, arguments: args });
    const textContent = result.content.find(c => c.type === 'text');
    return textContent ? textContent.text : JSON.stringify(result.content);
  }

  async stop() {
    try {
      if (this.client) await this.client.close();
    } catch { /* ignore close errors on shutdown */ }
  }
}
