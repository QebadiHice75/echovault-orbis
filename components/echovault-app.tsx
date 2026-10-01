"use client";

import { ReactorProvider } from "@reactor-team/js-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EchoPlayer } from "@/components/echo-player";
import { useOrbisSession } from "@/hooks/use-orbis-session";
import {
  CAMERAS,
  CHAINS,
  DEMO_TRANSACTION,
  MOODS,
  WORLDS,
  buildDirectorPrompt,
  echoIdFromHash,
  encodeSharedEcho,
  fallbackIntelligence,
  seedFromHash,
  shortAddress,
  shortHash,
  type ChainKey,
  type DirectorSettings,
  type EchoIntelligence,
  type SavedEcho,
  type VerifiedEvent,
} from "@/lib/echo";
import { ORBIS_MODEL_NAME, ORBIS_TRACKS, requestReactorJwt } from "@/lib/orbis";
import {
  deleteEchoLocal,
  getEchoVideoLocal,
  listEchoesLocal,
  saveEchoLocal,
} from "@/lib/vault-storage";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type WalletState = {
  address: string;
  chainId: number;
  balance: string;
};

const DEFAULT_DIRECTOR: DirectorSettings = {
  mood: "Monumental",
  camera: "Architectural dolly",
  world: "Physical archive",
  energy: 56,
  customDirection: "",
  audioPrompt: "",
};

const EVENT_LABELS: Record<VerifiedEvent["eventType"], string> = {
  "contract-deployment": "CONTRACT DEPLOYMENT",
  "native-transfer": "VALUE TRANSFER",
  "token-mint": "TOKEN MINT",
  "token-burn": "TOKEN BURN",
  "token-transfer": "TOKEN TRANSFER",
  "contract-interaction": "CONTRACT INTERACTION",
};

function formatWalletBalance(hex: string) {
  try {
    const wei = BigInt(hex);
    const whole = wei / 10n ** 18n;
    const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
    return `${whole}${fraction ? `.${fraction}` : ""} ETH`;
  } catch {
    return "—";
  }
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createPoster(echo: SavedEcho) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#e9e1d2";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#171718";
  ctx.lineWidth = 2;
  ctx.strokeRect(54, 54, canvas.width - 108, canvas.height - 108);

  ctx.save();
  ctx.translate(1180, 310);
  ctx.strokeStyle = "#661f2b";
  ctx.globalAlpha = 0.82;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, 70 + i * 38, -0.35 + i * 0.12, Math.PI * 1.45 + i * 0.08);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = "#661f2b";
  ctx.font = "600 24px Arial";
  ctx.fillText("ECHO / VAULT · VERIFIED CINEMATIC MEMORY", 100, 130);

  ctx.fillStyle = "#171718";
  ctx.font = "700 94px Georgia";
  const words = echo.title.split(" ");
  let line = "";
  let y = 320;
  for (const word of words) {
    const test = `${line}${word} `;
    if (ctx.measureText(test).width > 980 && line) {
      ctx.fillText(line.trim(), 100, y);
      line = `${word} `;
      y += 108;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), 100, y);

  ctx.font = "500 27px Arial";
  ctx.fillStyle = "#42403c";
  ctx.fillText(`${echo.event.chainName.toUpperCase()} · BLOCK ${echo.event.blockNumber.toLocaleString()}`, 104, 700);
  ctx.font = "400 22px monospace";
  ctx.fillText(echo.event.hash, 104, 758);
  ctx.font = "600 20px Arial";
  ctx.fillStyle = "#2847a1";
  ctx.fillText(`${EVENT_LABELS[echo.event.eventType]} · VERIFIED SOURCE`, 104, 820);
  ctx.fillStyle = "#171718";
  ctx.fillText(echo.id, 104, 875);

  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `${echo.id.toLowerCase()}-poster.png`);
  }, "image/png");
}

export function EchoVaultApp() {
  const jwtPromise = useRef<Promise<string> | null>(null);
  const currentJwt = useRef<string | null>(null);
  const getJwt = useCallback(async () => {
    const pending = (jwtPromise.current ??= requestReactorJwt());
    try {
      const jwt = await pending;
      currentJwt.current = jwt;
      return jwt;
    } catch (error) {
      if (jwtPromise.current === pending) jwtPromise.current = null;
      throw error;
    }
  }, []);
  const getCurrentJwt = useCallback(() => currentJwt.current, []);
  const clearJwt = useCallback(() => {
    jwtPromise.current = null;
    currentJwt.current = null;
  }, []);

  return (
    <ReactorProvider
      apiUrl="https://api.reactor.inc"
      modelName={ORBIS_MODEL_NAME}
      modelTracks={[...ORBIS_TRACKS]}
      connectOptions={{ autoConnect: false }}
      jwtToken={getJwt}
    >
      <EchoVaultExperience clearJwt={clearJwt} getCurrentJwt={getCurrentJwt} />
    </ReactorProvider>
  );
}

function EchoVaultExperience({
  clearJwt,
  getCurrentJwt,
}: {
  clearJwt: () => void;
  getCurrentJwt: () => string | null;
}) {
  const session = useOrbisSession(clearJwt, getCurrentJwt);
  const [chain, setChain] = useState<ChainKey>("base-sepolia");
  const [txHash, setTxHash] = useState("");
  const [event, setEvent] = useState<VerifiedEvent | null>(null);
  const [intelligence, setIntelligence] = useState<EchoIntelligence | null>(null);
  const [director, setDirector] = useState<DirectorSettings>(DEFAULT_DIRECTOR);
  const [finalPrompt, setFinalPrompt] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [directorBusy, setDirectorBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [vault, setVault] = useState<SavedEcho[]>([]);
  const [stageMode, setStageMode] = useState<"memory" | "proof">("memory");
  const [steerText, setSteerText] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [remixOf, setRemixOf] = useState<string | undefined>(undefined);
  const [echoNonce, setEchoNonce] = useState("0000");
  const [echoCreatedAt, setEchoCreatedAt] = useState(() => new Date().toISOString());
  const [vaultVideoUrl, setVaultVideoUrl] = useState("");
  const heroRef = useRef<HTMLElement>(null);

  const echoId = event ? `${echoIdFromHash(event.hash)}-${echoNonce}` : "ECHO-0000-0000";
  const title = intelligence?.title || "Unwritten Memory";

  const currentEcho = useMemo<SavedEcho | null>(() => {
    if (!event || !intelligence) return null;
    return {
      id: echoId,
      createdAt: echoCreatedAt,
      title: intelligence.title,
      summary: intelligence.summary,
      event,
      director,
      finalPrompt: finalPrompt || buildDirectorPrompt(event, intelligence, director),
      remixOf,
      hasLocalVideo: Boolean(recordingBlob),
    };
  }, [director, echoCreatedAt, echoId, event, finalPrompt, intelligence, recordingBlob, remixOf]);

  const refreshVault = useCallback(async () => {
    try {
      setVault(await listEchoesLocal());
    } catch {
      // IndexedDB can be unavailable in strict private browser contexts.
    }
  }, []);

  useEffect(() => {
    void refreshVault();
  }, [refreshVault]);

  useEffect(() => {
    const keyHandler = (eventKey: KeyboardEvent) => {
      const target = eventKey.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
      if ((eventKey.key === "/" && !typing) || ((eventKey.metaKey || eventKey.ctrlKey) && eventKey.key.toLowerCase() === "k")) {
        eventKey.preventDefault();
        setPaletteOpen((value) => !value);
      }
      if (eventKey.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, []);

  useEffect(() => () => {
    if (vaultVideoUrl) URL.revokeObjectURL(vaultVideoUrl);
  }, [vaultVideoUrl]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPaletteOpen(false);
  };

  const handleHeroPointer = (pointer: React.PointerEvent<HTMLElement>) => {
    const rect = pointer.currentTarget.getBoundingClientRect();
    const x = (pointer.clientX - rect.left) / rect.width - 0.5;
    const y = (pointer.clientY - rect.top) / rect.height - 0.5;
    pointer.currentTarget.style.setProperty("--hero-x", `${x * 18}deg`);
    pointer.currentTarget.style.setProperty("--hero-y", `${y * -14}deg`);
  };

  const connectWallet = async () => {
    setPageError("");
    const ethereum = (window as typeof window & { ethereum?: EthereumProvider }).ethereum;
    if (!ethereum) {
      setPageError("No EVM wallet was detected. You can still create an Echo by pasting a transaction hash.");
      return;
    }
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const chainHex = (await ethereum.request({ method: "eth_chainId" })) as string;
      const address = accounts[0];
      const balanceHex = (await ethereum.request({ method: "eth_getBalance", params: [address, "latest"] })) as string;
      const chainId = Number.parseInt(chainHex, 16);
      setWallet({ address, chainId, balance: formatWalletBalance(balanceHex) });
      if (chainId === CHAINS.base.chainId) setChain("base");
      if (chainId === CHAINS["base-sepolia"].chainId) setChain("base-sepolia");
      setNotice("Wallet identity attached to this vault session.");
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : "Wallet connection was cancelled.");
    }
  };

  const analyzeTransaction = async (hashOverride?: string, chainOverride?: ChainKey) => {
    const hash = (hashOverride ?? txHash).trim();
    const targetChain = chainOverride ?? chain;
    setPageError("");
    setNotice("");
    setLookupBusy(true);
    setEvent(null);
    setIntelligence(null);
    setFinalPrompt("");
    setRecordingBlob(null);
    try {
      const response = await fetch("/api/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash, chain: targetChain }),
      });
      const result = (await response.json()) as { event?: VerifiedEvent; error?: string };
      if (!response.ok || !result.event) throw new Error(result.error || "Could not verify this transaction.");
      setTxHash(hash);
      setChain(targetChain);
      setEvent(result.event);
      setRemixOf(undefined);
      const identityTime = new Date();
      setEchoCreatedAt(identityTime.toISOString());
      setEchoNonce(identityTime.getTime().toString(36).slice(-4).toUpperCase());

      let nextIntelligence = fallbackIntelligence(result.event);
      try {
        const aiResponse = await fetch("/api/echo-intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "interpret", event: result.event }),
        });
        if (aiResponse.ok) {
          const aiResult = (await aiResponse.json()) as { intelligence?: EchoIntelligence; warning?: string };
          nextIntelligence = aiResult.intelligence || nextIntelligence;
          if (aiResult.warning) setNotice(aiResult.warning);
        } else {
          setNotice("The verified event loaded, but Claude was unavailable. EchoVault switched to its local interpretation engine.");
        }
      } catch {
        setNotice("The verified event loaded, but Claude was unavailable. EchoVault switched to its local interpretation engine.");
      }
      setIntelligence(nextIntelligence);
      const nextDirector = { ...director, audioPrompt: nextIntelligence.audioPrompt };
      setDirector(nextDirector);
      setFinalPrompt(buildDirectorPrompt(result.event, nextIntelligence, nextDirector));
      requestAnimationFrame(() => scrollTo("director"));
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : "Transaction analysis failed.");
    } finally {
      setLookupBusy(false);
    }
  };

  const loadDemo = () => {
    setChain("base-sepolia");
    setTxHash(DEMO_TRANSACTION);
    void analyzeTransaction(DEMO_TRANSACTION, "base-sepolia");
  };

  const composeDirection = async () => {
    if (!event || !intelligence) return "";
    setDirectorBusy(true);
    setPageError("");
    try {
      const response = await fetch("/api/echo-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "direct", event, intelligence, director }),
      });
      const result = (await response.json()) as { prompt?: string; warning?: string };
      const prompt = result.prompt?.trim() || buildDirectorPrompt(event, intelligence, director);
      setFinalPrompt(prompt);
      if (result.warning) setNotice(result.warning);
      return prompt;
    } catch (caught) {
      const prompt = buildDirectorPrompt(event, intelligence, director);
      setFinalPrompt(prompt);
      setNotice("Claude was unavailable, so EchoVault used the deterministic director engine.");
      return prompt;
    } finally {
      setDirectorBusy(false);
    }
  };

  const createEcho = async () => {
    if (!event || !intelligence) {
      setPageError("Verify a transaction before opening the World Engine.");
      return;
    }
    setPageError("");
    const prompt = finalPrompt.trim() || buildDirectorPrompt(event, intelligence, director);
    setFinalPrompt(prompt);

    if (!session.connected) {
      const connected = await session.connectSession();
      if (!connected) return;
    }
    const started = await session.startWithConfig({
      prompt,
      image: session.image,
      seed: seedFromHash(event.hash),
      audioPrompt: director.audioPrompt,
    });
    if (started) {
      setNotice("Echo is live. Record a clip when the shot reaches the moment you want to preserve.");
      scrollTo("forge");
    }
  };

  const steerLive = async (direction?: string) => {
    const instruction = (direction ?? steerText).trim();
    if (!instruction) return;
    const base = finalPrompt || session.prompt;
    const prompt = `${base}\n\nLIVE STEERING: ${instruction}. Preserve continuity with the current shot; morph naturally at the next chunk boundary without a cut.`;
    const ok = await session.steerWithPrompt(prompt);
    if (ok) {
      setFinalPrompt(prompt);
      setSteerText("");
    }
  };

  const saveCurrentEcho = async () => {
    if (!currentEcho) return;
    try {
      await saveEchoLocal(currentEcho, recordingBlob);
      await refreshVault();
      setNotice(recordingBlob ? "Echo and its local video capture were sealed in this browser's Vault." : "Echo metadata was sealed. Record a clip before saving if you want the video stored locally too.");
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : "Could not save this Echo locally.");
    }
  };

  const proofLink = () => {
    if (!currentEcho) return "";
    const encoded = encodeSharedEcho(currentEcho);
    return `${window.location.origin}/echo?data=${encoded}`;
  };

  const copyProofLink = async () => {
    const link = proofLink();
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setNotice("Portable proof page copied to clipboard.");
  };

  const shareToX = () => {
    if (!currentEcho) return;
    const text = `I turned a verified onchain moment into a cinematic memory with EchoVault.\n\n${currentEcho.title}\n${currentEcho.event.chainName} · block ${currentEcho.event.blockNumber}\n\nProof stays factual. Interpretation becomes creative.`;
    const url = proofLink();
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
  };

  const exportProofJson = () => {
    if (!currentEcho) return;
    const proof = {
      schema: "echovault-proof-v1",
      exportedAt: new Date().toISOString(),
      verified: currentEcho.event,
      interpretation: {
        echoId: currentEcho.id,
        title: currentEcho.title,
        summary: currentEcho.summary,
        director: currentEcho.director,
        prompt: currentEcho.finalPrompt,
        remixOf: currentEcho.remixOf,
      },
    };
    downloadBlob(new Blob([`${JSON.stringify(proof, null, 2)}\n`], { type: "application/json" }), `${currentEcho.id.toLowerCase()}-proof.json`);
  };

  const remixEcho = (echo: SavedEcho) => {
    setEvent(echo.event);
    setChain(echo.event.chain);
    setTxHash(echo.event.hash);
    setIntelligence({
      title: `${echo.title} / Remix`,
      summary: echo.summary,
      significance: "This reinterpretation preserves the exact same verified source event while changing its creative direction.",
      suggestedPrompt: echo.finalPrompt,
      audioPrompt: echo.director.audioPrompt,
      source: "fallback",
    });
    setDirector({ ...echo.director, customDirection: "Reinterpret this event from a distinctly different cinematic perspective." });
    setFinalPrompt("");
    setRemixOf(echo.id);
    const identityTime = new Date();
    setEchoCreatedAt(identityTime.toISOString());
    setEchoNonce(identityTime.getTime().toString(36).slice(-4).toUpperCase());
    scrollTo("director");
  };

  const playVaultVideo = async (echo: SavedEcho) => {
    if (!echo.hasLocalVideo) return;
    const blob = await getEchoVideoLocal(echo.id);
    if (!blob) return;
    if (vaultVideoUrl) URL.revokeObjectURL(vaultVideoUrl);
    const url = URL.createObjectURL(blob);
    setVaultVideoUrl(url);
  };

  const deleteVaultEcho = async (id: string) => {
    await deleteEchoLocal(id);
    await refreshVault();
    setNotice("Echo removed from this browser's local Vault.");
  };

  return (
    <main className="site-shell">
      <nav className="top-nav">
        <button className="brand" type="button" onClick={() => scrollTo("entrance")}>
          <span className="brand-mark"><i /><i /></span>
          <span><strong>ECHO</strong><em>/</em>VAULT</span>
        </button>
        <div className="nav-links">
          <button type="button" onClick={() => scrollTo("create")}>Create</button>
          <button type="button" onClick={() => scrollTo("vault")}>Vault</button>
          <button type="button" onClick={() => scrollTo("principle")}>Principle</button>
          <a href="/about">About</a>
        </div>
        <div className="nav-actions">
          <button className="key-hint" type="button" onClick={() => setPaletteOpen(true)}>⌘K</button>
          <button className="wallet-button" type="button" onClick={connectWallet}>
            {wallet ? shortAddress(wallet.address, 4) : "Connect wallet"}
          </button>
        </div>
      </nav>

      <section id="entrance" className="hero" ref={heroRef} onPointerMove={handleHeroPointer}>
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-copy">
          <p className="kicker"><span>01</span> A CINEMATIC MEMORY SYSTEM FOR ONCHAIN LIFE</p>
          <h1>Your chain<br />has a <em>memory.</em></h1>
          <p className="hero-lede">Turn a verified onchain moment into a living world you can direct, steer, record, preserve and share.</p>
          <div className="hero-actions">
            <button className="primary-cta" type="button" onClick={() => scrollTo("create")}>
              Create an Echo <span>↘</span>
            </button>
            <button className="text-cta" type="button" onClick={loadDemo}>Explore a demo memory</button>
          </div>
          <div className="hero-proofline">
            <span>VERIFIED SOURCE</span><b>→</b><span>HUMAN DIRECTION</span><b>→</b><span>ORBIS WORLD</span>
          </div>
        </div>

        <div className="vault-object" aria-hidden="true">
          <div className="vault-tilt">
            <span className="orbit orbit-a" />
            <span className="orbit orbit-b" />
            <span className="orbit orbit-c" />
            <span className="memory-slab slab-a"><i>BLOCK</i><b>47,378,941</b></span>
            <span className="memory-slab slab-b"><i>PROOF</i><b>VERIFIED</b></span>
            <span className="memory-slab slab-c"><i>STATE</i><b>REMEMBERED</b></span>
            <span className="vault-core"><i /><b>EV</b></span>
          </div>
          <p>ARCHIVE OBJECT / INTERACTIVE</p>
        </div>
      </section>

      <section id="create" className="create-section section-frame">
        <div className="section-heading">
          <p className="kicker"><span>02</span> EVENT EXCAVATION</p>
          <h2>Begin with something<br /><em>that actually happened.</em></h2>
          <p>EchoVault keeps the source event factual. Everything cinematic happens in a separate interpretation layer.</p>
        </div>

        <div className="excavation-grid">
          <div className="source-panel">
            <div className="panel-topline"><span>SOURCE INPUT</span><span>RPC / VERIFIED</span></div>
            <label className="field-label">Network</label>
            <div className="segmented">
              {(Object.keys(CHAINS) as ChainKey[]).map((key) => (
                <button key={key} type="button" className={chain === key ? "active" : ""} onClick={() => setChain(key)}>
                  {CHAINS[key].name}
                </button>
              ))}
            </div>
            <label className="field-label" htmlFor="tx-hash">Transaction hash</label>
            <div className="hash-input-wrap">
              <input id="tx-hash" value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x..." spellCheck={false} />
              <button type="button" onClick={() => void analyzeTransaction()} disabled={lookupBusy}>{lookupBusy ? "Excavating…" : "Verify event"}</button>
            </div>
            <div className="source-helper">
              <button type="button" onClick={connectWallet}>{wallet ? "Wallet connected" : "Attach wallet identity"}</button>
              <span>or</span>
              <button type="button" onClick={loadDemo}>load demo transaction</button>
            </div>
            {wallet ? (
              <div className="wallet-strip">
                <span><small>WALLET</small>{shortAddress(wallet.address)}</span>
                <span><small>CHAIN ID</small>{wallet.chainId}</span>
                <span><small>BALANCE</small>{wallet.balance}</span>
              </div>
            ) : null}
          </div>

          <div className={`evidence-panel ${event ? "is-filled" : ""}`}>
            {event ? (
              <>
                <div className="evidence-seal"><span>✓</span> VERIFIED EVENT</div>
                <p className="event-type">{EVENT_LABELS[event.eventType]}</p>
                <h3>{intelligence?.title || "Interpreting the record…"}</h3>
                <p className="event-summary">{intelligence?.summary || `Block ${event.blockNumber.toLocaleString()} on ${event.chainName}.`}</p>
                <div className="evidence-grid">
                  <span><small>BLOCK</small><b>{event.blockNumber.toLocaleString()}</b></span>
                  <span><small>STATUS</small><b>{event.success ? "SUCCESS" : "FAILED"}</b></span>
                  <span><small>FROM</small><b>{shortAddress(event.from)}</b></span>
                  <span><small>TO</small><b>{shortAddress(event.to)}</b></span>
                  <span><small>VALUE</small><b>{event.valueEth} ETH</b></span>
                  <span><small>METHOD</small><b>{event.methodSelector}</b></span>
                </div>
                <a className="evidence-link" href={event.explorerUrl} target="_blank" rel="noreferrer">Inspect source ↗</a>
              </>
            ) : (
              <div className="evidence-empty">
                <span className="fingerprint" />
                <p>Paste a Base transaction and EchoVault will separate its verified facts from its creative potential.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="director" className="director-section section-frame">
        <div className="section-heading compact">
          <p className="kicker"><span>03</span> DIRECTOR CONSOLE</p>
          <h2>Facts stay fixed.<br /><em>You choose the feeling.</em></h2>
        </div>

        <div className="director-layout">
          <div className="director-controls">
            <ChoiceRow label="Mood" options={MOODS} value={director.mood} onChange={(mood) => setDirector((d) => ({ ...d, mood }))} />
            <ChoiceRow label="Camera" options={CAMERAS} value={director.camera} onChange={(camera) => setDirector((d) => ({ ...d, camera }))} />
            <ChoiceRow label="World" options={WORLDS} value={director.world} onChange={(world) => setDirector((d) => ({ ...d, world }))} />

            <div className="energy-control">
              <div><span>Energy</span><b>{director.energy.toString().padStart(2, "0")}</b></div>
              <input type="range" min="0" max="100" value={director.energy} onChange={(e) => setDirector((d) => ({ ...d, energy: Number(e.target.value) }))} />
              <div className="energy-labels"><span>STILL</span><span>BUILDING</span><span>VOLATILE</span></div>
            </div>

            <label className="direction-field">
              <span>Your direction</span>
              <textarea
                value={director.customDirection}
                onChange={(e) => setDirector((d) => ({ ...d, customDirection: e.target.value }))}
                placeholder="Example: Treat the deployment like a forgotten machine waking beneath a museum floor. Stay close to the material as it begins to move."
              />
            </label>

            <label className="direction-field audio-field">
              <span>Sound direction</span>
              <input value={director.audioPrompt} onChange={(e) => setDirector((d) => ({ ...d, audioPrompt: e.target.value }))} placeholder="Distant machinery, low room resonance…" />
            </label>

            <label className="reference-drop">
              <input type="file" accept="image/*" onChange={(e) => session.selectImage(e.target.files?.[0] ?? null)} />
              <span><b>+</b><strong>Reference frame</strong><small>{session.image?.name || "Optional · 16:9 works best"}</small></span>
            </label>
          </div>

          <div className="prompt-manuscript">
            <div className="panel-topline"><span>DIRECTOR MANUSCRIPT</span><span>{intelligence?.source === "claude" ? "CLAUDE" : "LOCAL"}</span></div>
            <p className="manuscript-note">Claude may shape the cinematic language, but it is explicitly instructed not to invent onchain facts.</p>
            <textarea
              value={finalPrompt}
              onChange={(e) => setFinalPrompt(e.target.value)}
              placeholder={event ? "Compose the cinematic direction…" : "Verify an event to create its director manuscript."}
              disabled={!event}
            />
            <div className="manuscript-actions">
              <button className="quiet-button dark" type="button" onClick={() => void composeDirection()} disabled={!event || directorBusy}>{directorBusy ? "Directing…" : "Refine with Claude"}</button>
              <button className="primary-cta dark" type="button" onClick={() => void createEcho()} disabled={!event || session.controlsBusy || session.runStarted}>
                {session.runStarted ? "World already live" : session.controlsBusy ? "Opening engine…" : "Create Echo"} <span>→</span>
              </button>
            </div>
            {event ? <div className="seed-line"><span>DETERMINISTIC MEMORY SEED</span><b>{seedFromHash(event.hash)}</b></div> : null}
          </div>
        </div>
      </section>

      <section id="forge" className="forge-section section-frame dark-frame">
        <div className="forge-heading">
          <div>
            <p className="kicker light"><span>04</span> THE FORGE</p>
            <h2>A record becomes<br /><em>a continuous world.</em></h2>
          </div>
          <div className="engine-status">
            <span className={`engine-light ${session.connected ? "online" : ""}`} />
            <div><small>ORBIS / REACTOR</small><strong>{session.status.toUpperCase()}</strong></div>
            {!session.connected ? <button type="button" onClick={() => void session.connectSession()} disabled={session.controlsBusy}>Connect engine</button> : <button type="button" onClick={() => void session.disconnectSession()} disabled={session.controlsBusy}>Disconnect</button>}
          </div>
        </div>

        <div className="mode-toggle">
          <button type="button" className={stageMode === "memory" ? "active" : ""} onClick={() => setStageMode("memory")}>Memory</button>
          <button type="button" className={stageMode === "proof" ? "active" : ""} onClick={() => setStageMode("proof")}>Proof</button>
        </div>

        {stageMode === "memory" ? (
          <EchoPlayer session={session} title={title} echoId={echoId} onRecordingChange={setRecordingBlob} />
        ) : (
          <ProofPlate event={event} intelligence={intelligence} echoId={echoId} />
        )}

        <div className="forge-console">
          <div className="steer-panel">
            <div className="panel-topline"><span>LIVE STEERING</span><span>NEXT CHUNK</span></div>
            <div className="edge-directions">
              {[
                ["PAST", "Reveal older layers of this same place, as if the current structure carries an archaeological memory."],
                ["EVOLVE", "Let the same environment evolve forward with more scale and momentum while preserving the current camera path."],
                ["OBSERVE", "Slow the motion and become more observational, lingering on materials and small evidence-like details."],
                ["DESCEND", "Move naturally downward into a deeper layer of the same architecture, preserving spatial continuity."],
              ].map(([label, prompt]) => <button key={label} type="button" onClick={() => void steerLive(prompt)} disabled={!session.runStarted}>{label}<span>↗</span></button>)}
            </div>
            <div className="steer-input">
              <input value={steerText} onChange={(e) => setSteerText(e.target.value)} placeholder="Tell the live world what should happen next…" />
              <button type="button" onClick={() => void steerLive()} disabled={!session.runStarted || !steerText.trim()}>Steer</button>
            </div>
          </div>

          <div className="run-controls">
            <div className="panel-topline"><span>RUN CONTROL</span><span>{session.resolution || "MODEL DEFAULT"}</span></div>
            <label>Delivery resolution
              <select value={session.resolution} onChange={(e) => session.setResolution(e.target.value)} disabled={session.runStarted}>
                <option value="">Model setting</option>
                {session.availableResolutions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <div className="run-button-row">
              <button type="button" onClick={() => void (session.paused ? session.resume() : session.pause())} disabled={!session.runStarted}>{session.paused ? "Resume" : "Pause"}</button>
              <button type="button" onClick={() => void session.reset()} disabled={!session.connected}>Reset</button>
            </div>
            <div className="event-tape">
              <small>RECENT MODEL EVENTS</small>
              <code>{session.events.length ? session.events.join(" / ") : "Waiting for the World Engine."}</code>
            </div>
          </div>
        </div>
        {session.error ? <p className="global-error">ORBIS · {session.error}</p> : null}
      </section>

      <section id="preserve" className="preserve-section section-frame">
        <div className="section-heading compact">
          <p className="kicker"><span>05</span> PRESERVE / DISTRIBUTE</p>
          <h2>Seal the memory.<br /><em>Keep the proof attached.</em></h2>
        </div>
        <div className="artifact-grid">
          <ArtifactCard number="A" title="Seal in Vault" body="Store the Echo metadata and, when recorded, the actual WebM clip in this browser using IndexedDB." action="Save Echo" onClick={() => void saveCurrentEcho()} disabled={!currentEcho} />
          <ArtifactCard number="B" title="Proof page" body="Create a portable URL containing the verified event and creative metadata, clearly separated." action="Copy proof link" onClick={() => void copyProofLink()} disabled={!currentEcho} />
          <ArtifactCard number="C" title="Share to X" body="Open an X post already carrying the Echo title, verified chain/block context and proof URL." action="Share on X" onClick={shareToX} disabled={!currentEcho} />
          <ArtifactCard number="D" title="Archive exports" body="Download a designed poster and a machine-readable provenance JSON alongside your video." action="Download poster" onClick={() => currentEcho && createPoster(currentEcho)} disabled={!currentEcho} secondaryAction="Proof JSON" onSecondary={exportProofJson} />
        </div>
      </section>

      <section id="vault" className="vault-section section-frame">
        <div className="vault-header">
          <div className="section-heading compact">
            <p className="kicker"><span>06</span> PERSONAL VAULT</p>
            <h2>Your remembered<br /><em>onchain history.</em></h2>
          </div>
          <p>{vault.length ? `${vault.length} Echo${vault.length === 1 ? "" : "es"} sealed on this device.` : "Your first saved Echo will appear here as an archival plate."}</p>
        </div>

        {vaultVideoUrl ? (
          <div className="vault-video-lightbox">
            <video src={vaultVideoUrl} controls autoPlay />
            <button type="button" onClick={() => setVaultVideoUrl("")}>Close local capture</button>
          </div>
        ) : null}

        <div className="archive-rail">
          {vault.length ? vault.map((echo, index) => (
            <article className="archive-card" key={`${echo.id}-${echo.createdAt}`}>
              <div className="archive-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="archive-rings" aria-hidden="true"><i /><i /><i /></div>
              <small>{EVENT_LABELS[echo.event.eventType]} · {echo.event.chainName}</small>
              <h3>{echo.title}</h3>
              <p>{echo.summary}</p>
              <div className="archive-meta"><span>BLOCK {echo.event.blockNumber.toLocaleString()}</span><span>{echo.id}</span></div>
              <div className="archive-actions">
                {echo.hasLocalVideo ? <button type="button" onClick={() => void playVaultVideo(echo)}>Play capture</button> : null}
                <button type="button" onClick={() => remixEcho(echo)}>Remix</button>
                <button type="button" onClick={() => void deleteVaultEcho(echo.id)}>Remove</button>
              </div>
            </article>
          )) : (
            <article className="archive-card empty-archive">
              <span>NO ECHOES YET</span>
              <h3>The archive begins with one verified moment.</h3>
              <button type="button" onClick={() => scrollTo("create")}>Create the first Echo →</button>
            </article>
          )}
        </div>
      </section>

      <section id="principle" className="principle-section">
        <p className="kicker light"><span>07</span> THE PRINCIPLE</p>
        <div className="principle-statement">
          <span>BLOCKCHAINS</span>
          <h2>remember what<br /><em>happened.</em></h2>
          <span>ECHOVAULT</span>
          <h2>remembers what<br /><em>it felt like.</em></h2>
        </div>
        <div className="principle-flow">
          <span>VERIFIED EVENT</span><b>01</b><i />
          <span>HUMAN DIRECTION</span><b>02</b><i />
          <span>ORBIS MEMORY</span><b>03</b><i />
          <span>SHAREABLE PROOF</span><b>04</b>
        </div>
      </section>

      <footer>
        <div className="brand footer-brand"><span className="brand-mark"><i /><i /></span><span><strong>ECHO</strong><em>/</em>VAULT</span></div>
        <p>Built as a provenance-aware cinematic interface for Visko Orbis on Reactor.</p>
        <div><a href="/about">Documentation</a><button type="button" onClick={() => scrollTo("entrance")}>Back to top ↑</button></div>
      </footer>

      {pageError ? <div className="toast error-toast"><button type="button" onClick={() => setPageError("")}>×</button><strong>Something needs attention</strong><span>{pageError}</span></div> : null}
      {notice ? <div className="toast notice-toast"><button type="button" onClick={() => setNotice("")}>×</button><strong>Vault note</strong><span>{notice}</span></div> : null}

      {paletteOpen ? (
        <div className="command-backdrop" onMouseDown={() => setPaletteOpen(false)}>
          <div className="command-palette" onMouseDown={(e) => e.stopPropagation()}>
            <div className="command-search"><span>⌘</span><input autoFocus placeholder="Jump anywhere…" readOnly /></div>
            <button type="button" onClick={() => scrollTo("create")}><span>01</span>Create an Echo<kbd>C</kbd></button>
            <button type="button" onClick={() => scrollTo("director")}><span>02</span>Open Director Console<kbd>D</kbd></button>
            <button type="button" onClick={() => scrollTo("forge")}><span>03</span>Open the Forge<kbd>F</kbd></button>
            <button type="button" onClick={() => scrollTo("vault")}><span>04</span>View personal Vault<kbd>V</kbd></button>
            <button type="button" onClick={loadDemo}><span>05</span>Load demo memory<kbd>↵</kbd></button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ChoiceRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="choice-row">
      <span>{label}</span>
      <div>{options.map((option) => <button type="button" key={option} className={value === option ? "active" : ""} onClick={() => onChange(option)}>{option}</button>)}</div>
    </div>
  );
}

function ProofPlate({
  event,
  intelligence,
  echoId,
}: {
  event: VerifiedEvent | null;
  intelligence: EchoIntelligence | null;
  echoId: string;
}) {
  if (!event) return <div className="proof-plate empty-proof"><p>Verify an onchain event to open Proof Mode.</p></div>;
  return (
    <div className="proof-plate">
      <div className="proof-stamp">SOURCE<br />VERIFIED</div>
      <div className="proof-main">
        <p>ECHOVAULT / PROOF MODE</p>
        <h3>{intelligence?.title || EVENT_LABELS[event.eventType]}</h3>
        <code>{event.hash}</code>
      </div>
      <div className="proof-columns">
        <span><small>NETWORK</small><b>{event.chainName}</b></span>
        <span><small>BLOCK</small><b>{event.blockNumber.toLocaleString()}</b></span>
        <span><small>FROM</small><b>{shortAddress(event.from)}</b></span>
        <span><small>TO</small><b>{shortAddress(event.to)}</b></span>
        <span><small>TYPE</small><b>{EVENT_LABELS[event.eventType]}</b></span>
        <span><small>RESULT</small><b>{event.success ? "SUCCESS" : "FAILED"}</b></span>
      </div>
      <div className="proof-footer"><span>{echoId}</span><span>CREATIVE INTERPRETATION IS NOT PART OF THE VERIFIED RECORD</span></div>
    </div>
  );
}

function ArtifactCard({
  number,
  title,
  body,
  action,
  onClick,
  disabled,
  secondaryAction,
  onSecondary,
}: {
  number: string;
  title: string;
  body: string;
  action: string;
  onClick: () => void;
  disabled?: boolean;
  secondaryAction?: string;
  onSecondary?: () => void;
}) {
  return (
    <article className="artifact-card">
      <span className="artifact-number">{number}</span>
      <h3>{title}</h3>
      <p>{body}</p>
      <div>
        <button type="button" onClick={onClick} disabled={disabled}>{action} <span>↗</span></button>
        {secondaryAction && onSecondary ? <button className="secondary-artifact" type="button" onClick={onSecondary} disabled={disabled}>{secondaryAction}</button> : null}
      </div>
    </article>
  );
}
