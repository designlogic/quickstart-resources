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

server.tool(
  "get-colors-for-mood",
  "Gets colors for a mood (maximum 2 colors)",
  {
    mood: z.string().describe("User's mood"),
    count: z.number().min(1).max(2).default(1).describe("How many colors to return (1-2)"),
  },
  async ({ mood, count }) => {
    try {
      // Ensure count is within API limits
      const safeCount = Math.min(count, 2);
      
      const response = await fetch('https://workflow.sanctifai.com/webhook/color-chooser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          colorCount: safeCount,
          mood: mood,
        }),
      });

      console.error('=== DEBUG START ===');
      console.error('Request:', { colorCount: safeCount, mood: mood });
      
      const text = await response.text();
      console.error('Raw API response:', text);
      console.error('Response status:', response.status);
      console.error('Response headers:', response.headers);
      
      let data: ColorResponse;
      try {
        data = JSON.parse(text) as ColorResponse;
        console.error('Parsed response:', JSON.stringify(data, null, 2));
      } catch (e) {
        console.error('Failed to parse response:', e);
        throw new Error(`Invalid response from color API: ${text}`);
      }
      console.error('=== DEBUG END ===');

      // Check if the response indicates an error
      if (!data.success) {
        throw new Error(data.message || "API request failed");
      }

      // Format the response text
      const alertsText = `Colors for ${mood} mood:\n${data.message}`;
      return {
        content: [
          {
            type: "text",
            text: alertsText
          },
        ],
      };
    } catch (error: any) {
      console.error('Error calling color API:', error);
      
      // Provide a more specific error message based on the error type
      const errorMessage = error.message?.includes("maximum color count")
        ? "Sorry, I can only provide up to 2 colors at a time. Please try again with a smaller number."
        : "Sorry, I couldn't get color suggestions at the moment. Please try again.";
      
      return {
        content: [
          {
            type: "text",
            text: errorMessage,
          },
        ],
      };
    }
  },
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
