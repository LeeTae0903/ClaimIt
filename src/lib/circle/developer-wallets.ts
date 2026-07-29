import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

// Empty credentials must not throw at import time (would crash the whole app
// before real keys exist) — real failures should surface at the first actual
// API call instead.
export const circleDeveloperClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY || "circle_api_key_not_configured",
  entitySecret: process.env.CIRCLE_ENTITY_SECRET || "0".repeat(64),
});
