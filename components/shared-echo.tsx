"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { decodeSharedEcho, shortAddress, shortHash, type VerifiedEvent } from "@/lib/echo";

type VerificationState = "checking" | "verified" | "mismatch" | "unavailable";

export function SharedEcho() {
  const search = useSearchParams();
  const echo = useMemo(() => {
    const data = search.get("data");
    return data ? decodeSharedEcho(data) : null;
  }, [search]);
  const [verification, setVerification] = useState<VerificationState>("checking");
  const [liveEvent, setLiveEvent] = useState<VerifiedEvent | null>(null);

  useEffect(() => {
    if (!echo) return;
    let cancelled = false;
    const verify = async () => {
      setVerification("checking");
      try {
        const response = await fetch("/api/transaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hash: echo.event.hash, chain: echo.event.chain }),
        });
        const result = (await response.json()) as { event?: VerifiedEvent };
        if (cancelled) return;
        if (!response.ok || !result.event) {
          setVerification("unavailable");
          return;
        }
        setLiveEvent(result.event);
        const original = echo.event;
        const current = result.event;
        const matches =
          current.hash.toLowerCase() === original.hash.toLowerCase() &&
          current.blockNumber === original.blockNumber &&
          current.from.toLowerCase() === original.from.toLowerCase() &&
          (current.to || "").toLowerCase() === (original.to || "").toLowerCase() &&
          current.success === original.success;
        setVerification(matches ? "verified" : "mismatch");
      } catch {
        if (!cancelled) setVerification("unavailable");
      }
    };
    void verify();
    return () => {
      cancelled = true;
    };
  }, [echo]);

  if (!echo) {
    return (
      <main className="shared-page">
        <a className="shared-brand" href="/">ECHO/VAULT</a>
        <section className="shared-missing">
          <p>PROOF PAGE</p>
          <h1>This Echo could not be opened.</h1>
          <span>The portable proof payload may be missing or damaged.</span>
          <a href="/">Return to EchoVault →</a>
        </section>
      </main>
    );
  }

  const source = liveEvent || echo.event;
  const verificationLabel = {
    checking: "REVERIFYING SOURCE…",
    verified: "LIVE SOURCE VERIFIED",
    mismatch: "SOURCE MISMATCH",
    unavailable: "LIVE CHECK UNAVAILABLE",
  }[verification];

  return (
    <main className="shared-page">
      <header className="shared-header">
        <a className="shared-brand" href="/">ECHO/VAULT</a>
        <span>PORTABLE PROOF / {echo.id}</span>
      </header>
      <section className="shared-hero">
        <div className="shared-orbit"><i /><i /><i /><b>{verification === "verified" ? "✓" : "·"}</b></div>
        <p>{source.chainName.toUpperCase()} · BLOCK {source.blockNumber.toLocaleString()}</p>
        <h1>{echo.title}</h1>
        <blockquote>{echo.summary}</blockquote>
        <div className={`shared-verification verify-${verification}`}><span />{verificationLabel}</div>
      </section>
      <section className="shared-proof-grid">
        <div><small>TRANSACTION</small><code>{source.hash}</code></div>
        <div><small>EVENT TYPE</small><strong>{source.eventType.replaceAll("-", " ").toUpperCase()}</strong></div>
        <div><small>FROM</small><strong>{shortAddress(source.from, 7)}</strong></div>
        <div><small>TO</small><strong>{shortAddress(source.to, 7)}</strong></div>
        <div><small>STATUS</small><strong>{source.success ? "VERIFIED SUCCESS" : "VERIFIED FAILURE"}</strong></div>
        <div><small>CREATED</small><strong>{new Date(echo.createdAt).toLocaleString()}</strong></div>
      </section>
      {verification === "mismatch" ? <div className="shared-warning">This URL's encoded source metadata does not match the transaction currently returned by the configured Base RPC. Treat the encoded interpretation as unverified until the discrepancy is resolved.</div> : null}
      {verification === "unavailable" ? <div className="shared-warning neutral">The live RPC check could not complete. The original encoded source is shown, but this page is not claiming a fresh verification.</div> : null}
      <section className="shared-separation">
        <div>
          <span>01 / VERIFIED</span>
          <h2>The record</h2>
          <p>The chain, block, transaction hash, addresses, result and event classification are blockchain-source data. This page attempts to re-read the transaction when opened.</p>
          <a href={source.explorerUrl} target="_blank" rel="noreferrer">Inspect {shortHash(source.hash)} ↗</a>
        </div>
        <div>
          <span>02 / INTERPRETED</span>
          <h2>The memory</h2>
          <p>Mood: {echo.director.mood}. Camera: {echo.director.camera}. World: {echo.director.world}. Energy: {echo.director.energy}/100.</p>
          <p className="shared-prompt">{echo.finalPrompt}</p>
        </div>
      </section>
      <footer className="shared-footer"><span>FACTS STAY IMMUTABLE. INTERPRETATION STAYS CREATIVE.</span><a href="/">Create your own Echo →</a></footer>
    </main>
  );
}
