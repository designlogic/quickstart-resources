import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create server instance
const server = new McpServer({
  name: "demo",
  version: "1.0.0",
});


server.tool(
  "get-colors-for-mood",
  "Gets colors for a mood",
  {
    mood: z.string().describe("User's mood"),
    count: z.number().describe("How many colors to return"),
  },
  async ({ mood, count }) => {
   
    // Predefined colors with friendly names
    const moodColors = [
      { name: "Coral Red", hex: "#FF6B6B" },
      { name: "Ocean Turquoise", hex: "#4ECDC4" }, 
      { name: "Summer Sky Blue", hex: "#45B7D1" },
      { name: "Fresh Sage", hex: "#96CEB4" },
      { name: "Warm Sand", hex: "#FFEEAD" }
    ];

    // Return requested number of colors (capped at available colors)
    const numColors = Math.min(count, moodColors.length);
    const selectedColors = moodColors.slice(0, numColors);

    const colorList = selectedColors
      .map(color => `${color.name} (${color.hex})`)
      .join("\n");

    const alertsText = `Colors for ${mood} mood:\n${colorList}`;
    return {
      content: [
        {
          type: "text",
          text: alertsText
        },
      ],
    };
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
