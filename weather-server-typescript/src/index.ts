import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

interface ColorResponse {
  success: boolean;
  message: string;
}

// Create server instance
const server = new McpServer({
  name: "demo",
  version: "1.0.0",
});

async function getColorsForMood({ mood, count }: { mood: string; count: number }) {
  try {
      const response = await fetch('https://workflow.sanctifai.com/webhook/color-chooser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          colorCount: count, // Always request 2 colors
          mood: mood,
        }),
      });

      console.error('=== SERVER DEBUG START ===');
      console.error('Request:', { colorCount: count, mood: mood });
      
      const text = await response.text();
      console.error('Raw API response:', text);
      console.error('Response status:', response.status);
      
      let data: ColorResponse;
      try {
        data = JSON.parse(text) as ColorResponse;
        console.error('Parsed response:', JSON.stringify(data, null, 2));
      } catch (e) {
        console.error('Failed to parse response:', e);
        return {
          content: [
            {
              type: "text" as const,
              text: `Invalid response from color API: ${text}`,
            },
          ],
        };
      }
      console.error('=== SERVER DEBUG END ===');

      // Always return the API's message, whether success or failure
      return {
        content: [
          {
            type: "text" as const,
            text: data.message,
          },
        ],
      };
  } catch (error: any) {
    console.error('Error calling color API:', error);
    return {
      content: [
        {
          type: "text" as const,
          text: error.message || "Unknown error occurred",
        },
      ],
    };
  }
}

server.tool(
  "get-colors-for-mood",
  "Gets colors for a mood",
  {
    mood: z.string().describe("User's mood"),
    count: z.number().min(1).default(1).describe("How many colors to return"),
  },
  getColorsForMood
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Demo MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
