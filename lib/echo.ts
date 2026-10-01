export type ChainKey = "base-sepolia" | "base";

export type ChainConfig = {
  key: ChainKey;
  name: string;
  shortName: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  accent: string;
};

export const CHAINS: Record<ChainKey, ChainConfig> = {
  "base-sepolia": {
    key: "base-sepolia",
    name: "Base Sepolia",
    shortName: "BASE SEPOLIA",
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    accent: "#2847a1",
  },
  base: {
    key: "base",
    name: "Base",
    shortName: "BASE",
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    accent: "#2847a1",
  },
};

export const DEMO_TRANSACTION =
  "0x821e3b9574ea66b33f76568ef6db1df3236568bdacffd9633989a6e243f2f3ca";

export type VerifiedEvent = {
  hash: string;
  chain: ChainKey;
  chainName: string;
  chainId: number;
  blockNumber: number;
  timestamp: string;
  from: string;
  to: string | null;
  valueEth: string;
  gasUsed: string;
  success: boolean;
  methodSelector: string;
  eventType:
    | "contract-deployment"
    | "native-transfer"
    | "token-mint"
    | "token-burn"
    | "token-transfer"
    | "contract-interaction";
  logCount: number;
  explorerUrl: string;
};

export type EchoIntelligence = {
  title: string;
  summary: string;
  significance: string;
  suggestedPrompt: string;
  audioPrompt: string;
  source: "claude" | "fallback";
};

export type DirectorSettings = {
  mood: string;
  camera: string;
  world: string;
  energy: number;
  customDirection: string;
  audioPrompt: string;
};

export type SavedEcho = {
  id: string;
  createdAt: string;
  title: string;
  summary: string;
  event: VerifiedEvent;
  director: DirectorSettings;
  finalPrompt: string;
  remixOf?: string;
  hasLocalVideo?: boolean;
};

export const MOODS = [
  "Monumental",
  "Dreamlike",
  "Documentary",
  "Intimate",
  "Uncanny",
] as const;

export const CAMERAS = [
  "Slow aerial",
  "Handheld witness",
  "Macro tracking",
  "Architectural dolly",
  "Static tableau",
] as const;

export const WORLDS = [
  "Physical archive",
  "Brutalist monument",
  "Organic machine",
  "Infinite interior",
  "Celestial infrastructure",
] as const;

export function shortAddress(value: string | null | undefined, size = 5) {
  if (!value) return "—";
  if (value.length <= size * 2 + 2) return value;
  return `${value.slice(0, size + 2)}…${value.slice(-size)}`;
}

export function shortHash(value: string, size = 7) {
  if (!value) return "—";
  return `${value.slice(0, size + 2)}…${value.slice(-size)}`;
}

export function echoIdFromHash(hash: string) {
  return `ECHO-${hash.slice(2, 6).toUpperCase()}-${hash.slice(-4).toUpperCase()}`;
}

export function seedFromHash(hash: string) {
  const clean = hash.replace(/^0x/, "").slice(0, 8);
  const parsed = Number.parseInt(clean || "2a", 16);
  return Number.isFinite(parsed) ? parsed >>> 0 : 42;
}

export function fallbackIntelligence(event: VerifiedEvent): EchoIntelligence {
  const labels: Record<VerifiedEvent["eventType"], string> = {
    "contract-deployment": "A new system entered the chain",
    "native-transfer": "Value crossed from one address to another",
    "token-mint": "A new token artifact was created",
    "token-burn": "A token artifact left circulation",
    "token-transfer": "A token artifact changed hands",
    "contract-interaction": "A contract changed state",
  };
  const titleMap: Record<VerifiedEvent["eventType"], string> = {
    "contract-deployment": "The First Assembly",
    "native-transfer": "Passage of Value",
    "token-mint": "An Object Appears",
    "token-burn": "The Vanishing Record",
    "token-transfer": "A Change of Hands",
    "contract-interaction": "The State Changed",
  };
  return {
    title: titleMap[event.eventType],
    summary: `${labels[event.eventType]} on ${event.chainName} at block ${event.blockNumber.toLocaleString()}.`,
    significance: "The transaction is preserved as verified source material; the cinematic layer is a creative interpretation of that record.",
    suggestedPrompt: `A single continuous cinematic memory inspired by a verified ${event.eventType.replaceAll("-", " ")} on ${event.chainName}. Build a tactile archival world where the event feels physically present: engraved block numbers, suspended evidence fragments, monumental architecture, restrained human-scale motion. The camera moves with intention through one unbroken shot. No text overlays, no cuts, no logos.`,
    audioPrompt: "Low architectural resonance, distant mechanical movement, soft room tone and restrained cinematic ambience.",
    source: "fallback",
  };
}

export function buildDirectorPrompt(
  event: VerifiedEvent,
  intelligence: EchoIntelligence,
  director: DirectorSettings,
) {
  const energy = director.energy < 34 ? "restrained" : director.energy < 67 ? "building" : "high-intensity";
  const userDirection = director.customDirection.trim()
    ? `Creative direction from the user: ${director.customDirection.trim()}`
    : "Keep the interpretation focused on the verified event rather than adding unrelated narrative.";

  return [
    intelligence.suggestedPrompt,
    `Mood: ${director.mood}. Camera language: ${director.camera}. World language: ${director.world}. Energy: ${energy} (${director.energy}/100).`,
    `Verified anchor: ${event.eventType.replaceAll("-", " ")} on ${event.chainName}, block ${event.blockNumber}, transaction ${event.hash}.`,
    userDirection,
    "Maintain one continuous shot with coherent motion across chunk boundaries. Avoid readable text inside the generated scene, UI elements, watermarks, hard cuts, sudden camera teleportation, and unrelated symbols.",
  ].join("\n\n");
}

export function encodeSharedEcho(echo: SavedEcho) {
  const payload = JSON.stringify({
    id: echo.id,
    createdAt: echo.createdAt,
    title: echo.title,
    summary: echo.summary,
    event: echo.event,
    director: echo.director,
    finalPrompt: echo.finalPrompt.slice(0, 800),
    remixOf: echo.remixOf,
  });
  if (typeof window === "undefined") return "";
  const bytes = new TextEncoder().encode(payload);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeSharedEcho(value: string): SavedEcho | null {
  try {
    if (!value || value.length > 20_000) return null;
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<SavedEcho>;
    const event = parsed.event as Partial<VerifiedEvent> | undefined;
    const director = parsed.director as Partial<DirectorSettings> | undefined;

    if (
      typeof parsed.id !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.title !== "string" ||
      typeof parsed.summary !== "string" ||
      typeof parsed.finalPrompt !== "string" ||
      !event ||
      !/^0x[0-9a-fA-F]{64}$/.test(event.hash || "") ||
      (event.chain !== "base" && event.chain !== "base-sepolia") ||
      typeof event.chainName !== "string" ||
      typeof event.blockNumber !== "number" ||
      typeof event.from !== "string" ||
      typeof event.success !== "boolean" ||
      typeof event.eventType !== "string" ||
      typeof event.explorerUrl !== "string" ||
      !director ||
      typeof director.mood !== "string" ||
      typeof director.camera !== "string" ||
      typeof director.world !== "string" ||
      typeof director.energy !== "number" ||
      typeof director.customDirection !== "string" ||
      typeof director.audioPrompt !== "string"
    ) {
      return null;
    }

    return parsed as SavedEcho;
  } catch {
    return null;
  }
}
