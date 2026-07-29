import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";

export const circleUserClient = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY || "circle_api_key_not_configured",
});
