export async function register() {
  // Background jobs need Node APIs and the database; never run them on the edge.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAccountPurgeScheduler } = await import("./lib/account-purge-scheduler");
    startAccountPurgeScheduler();
  }
}
