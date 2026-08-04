import { createPublicClient, defineChain, http } from "viem";

/**
 * Arc Testnet. USDC is the native gas token here, declared with 18 decimals —
 * that is the *gas* view. The USDC people actually send is the 6-decimal
 * ERC-20 at ARC_USDC_ADDRESS, and everything in this app deals in that one.
 * Reading a balance or an amount off the native token would be wrong by a
 * factor of 10^12.
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

/** The 6-decimal USDC ERC-20. Amounts in this app are its base units. */
export const ARC_USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Read-only client. Server-side verification never trusts the browser. */
export const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});
