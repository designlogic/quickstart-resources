import OpenAI from "openai";
import type { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";

import dotenv from "dotenv";

dotenv.config(); // load environment variables from .env

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set");
}

// System prompt to give context to the agent
const SYSTEM_PROMPT = `You are a helpful assistant.`;

class MCPClient {
  private mcp: Client;
  private openai: OpenAI;
  private transport: StdioClientTransport | null = null;
  private tools: ChatCompletionTool[] = [];
  private conversationHistory: ChatCompletionMessageParam[] = [];
  private maxHistoryLength: number = 10; // Maximum number of message pairs to keep

  constructor() {
    // Initialize OpenAI client and MCP client
    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    
    // Initialize conversation history with system prompt
    this.conversationHistory.push({
      role: "system",
      content: SYSTEM_PROMPT,
    });
  }

  private trimConversationHistory() {
    // Keep system message and last N pairs of messages
    if (this.conversationHistory.length > (this.maxHistoryLength * 2) + 1) {
      const systemMessage = this.conversationHistory[0];
      const recentMessages = this.conversationHistory.slice(-(this.maxHistoryLength * 2));
      this.conversationHistory = [systemMessage, ...recentMessages];
    }
  }

  async connectToServer(serverScriptPath: string) {
    /**
     * Connect to an MCP server
     *
     * @param serverScriptPath - Path to the server script (.py or .js)
     */
    try {
      // Determine script type and appropriate command
      const isJs = serverScriptPath.endsWith(".js");
      const isPy = serverScriptPath.endsWith(".py");
      if (!isJs && !isPy) {
        throw new Error("Server script must be a .js or .py file");
      }
      const command = isPy
        ? process.platform === "win32"
          ? "python"
          : "python3"
        : process.execPath;

      // Initialize transport and connect to server
      this.transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
      });
      this.mcp.connect(this.transport);

      // List available tools
      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
      console.log(
        "Connected to server with tools:",
        this.tools.map((tool) => tool.function.name),
      );
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  async processQuery(query: string) {
    /**
     * Process a query using GPT-4 and available tools
     *
     * @param query - The user's input query
     * @returns Processed response as a string
     */
    // Add user's query to conversation history
    this.conversationHistory.push({
      role: "user",
      content: query,
    });

    // Initial OpenAI API call with full conversation history
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: this.conversationHistory,
      tools: this.tools,
      tool_choice: "auto",
    });

    // Process response and handle tool calls
    const finalText = [];
    const toolResults = [];

    const choice = response.choices[0];
    if (choice.message.content) {
      finalText.push(choice.message.content);
      // Add assistant's response to conversation history
      this.conversationHistory.push({
        role: "assistant",
        content: choice.message.content,
      });
    }

    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        // Execute tool call
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        const result = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });
        toolResults.push(result);
        finalText.push(
          `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`,
        );

        // Add tool interaction to conversation history
        this.conversationHistory.push({
          role: "assistant",
          content: "",
          tool_calls: [toolCall],
        } as ChatCompletionMessageParam);
        this.conversationHistory.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.content as string,
        } as ChatCompletionMessageParam);

        // Get next response from GPT-4 with updated history
        const response = await this.openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: this.conversationHistory,
        });

        if (response.choices[0].message.content) {
          const content = response.choices[0].message.content;
          finalText.push(content);
          // Add final response to conversation history
          this.conversationHistory.push({
            role: "assistant",
            content: content,
          });
        }
      }
    }

    // Trim history if it gets too long
    this.trimConversationHistory();

    return finalText.join("\n");
  }

  async chatLoop() {
    /**
     * Run an interactive chat loop
     */
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log("\nMCP Client Started!");
      console.log("Type your queries or 'quit' to exit.");

      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }
        const response = await this.processQuery(message);
        console.log("\n" + response);
      }
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    /**
     * Clean up resources
     */
    await this.mcp.close();
  }
}

async function main() {
  if (process.argv.length < 3) {
    console.log("Usage: node build/index.js <path_to_server_script>");
    return;
  }
  const mcpClient = new MCPClient();
  try {
    await mcpClient.connectToServer(process.argv[2]);
    await mcpClient.chatLoop();
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();
