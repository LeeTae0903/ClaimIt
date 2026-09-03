import { createPublicClient, defineChain, http } from "viem";

/**
 * Arc Testnet. USDC is the native gas token here, declared with 18 decimals —
 * that is the *gas* view. The USDC people actually send is the 6-decimal
 * ERC-20 handled elsewhere (see transfer-service.ts's ARC_USDC_ADDRESS), and
 * everything money-related in this app deals in that one, not this one.
 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

/**
 * Read-only client, used only to verify SIWE signatures server-side
 * (including ERC-1271 smart-contract wallets, which can't be checked with a
 * plain off-chain ECDSA recover). Never used to move funds — payouts and
 * deposits stay on Circle's developer- and user-controlled wallet APIs.
 */
export const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});
