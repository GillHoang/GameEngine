import { GameClient } from "./GameClient";

/**
 * Entry point for the Game Engine
 */
async function main() {
  try {
    console.log("Starting HanhBot Game Engine...");

    // Get the GameClient singleton instance
    const gameClient = GameClient.getInstance();

    // Initialize the client
    await gameClient.initialize();

    // Start scheduled tasks
    gameClient.startScheduledTasks();

    console.log("HanhBot Game Engine started successfully!");

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("Received SIGINT. Shutting down gracefully...");
      await gameClient.shutdown();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("Received SIGTERM. Shutting down gracefully...");
      await gameClient.shutdown();
      process.exit(0);
    });
  } catch (error) {
    console.error("Failed to start Game Engine:", error);
    process.exit(1);
  }
}

// Run the application
main();
