"use client";

import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";
import { useEffect, useRef, useState } from "react";

import {
  DOCUMENTED_RESOLUTIONS,
  type OrbisMessage,
  unwrapOrbisMessage,
} from "@/lib/orbis";

type StartConfig = {
  prompt: string;
  image?: File | null;
  seed?: number;
  audioPrompt?: string;
};

export function useOrbisSession(
  clearJwt: () => void,
  getCurrentJwt: () => string | null,
) {
  const { status, sessionId, connect, disconnect, sendCommand, uploadFile } =
    useReactor((state) => ({
      status: state.status,
      sessionId: state.sessionId,
      connect: state.connect,
      disconnect: state.disconnect,
      sendCommand: state.sendCommand,
      uploadFile: state.uploadFile,
    }));

  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [resolution, setResolution] = useState("");
  const [availableResolutions, setAvailableResolutions] = useState<string[]>(
    DOCUMENTED_RESOLUTIONS,
  );
  const [muted, setMuted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [runStarted, setRunStarted] = useState(false);
  const [mediaEnabled, setMediaEnabled] = useState(true);
  const [paused, setPaused] = useState(false);
  const [imageStatus, setImageStatus] = useState("");
  const [error, setError] = useState("");
  const [events, setEvents] = useState<string[]>([]);

  const previousStatus = useRef(status);
  const disconnecting = useRef(false);
  const conditionsReadyResolver = useRef<(() => void) | null>(null);
  const imageReadyResolver = useRef<(() => void) | null>(null);
  const expectsImageForRun = useRef(false);

  const connected = status === "ready";

  useEffect(() => {
    if (status === "disconnected" && previousStatus.current !== "disconnected") {
      setRunStarted(false);
      setPaused(false);
      setImageStatus("");
    }
    previousStatus.current = status;
  }, [status]);

  useEffect(() => {
    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted || !sessionId) return;
      const jwt = getCurrentJwt();
      if (!jwt) return;
      void fetch("/api/session-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, jwt }),
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [getCurrentJwt, sessionId]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !sessionId) return;
    const jwt = getCurrentJwt();
    if (!jwt) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const register = async (attempt: number) => {
      try {
        const response = await fetch("/api/session-registry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, jwt }),
        });
        if (!response.ok) throw new Error(`registry returned ${response.status}`);
      } catch (caught) {
        if (cancelled) return;
        if (attempt < 5) {
          retryTimer = setTimeout(() => void register(attempt + 1), attempt * 1000);
          return;
        }
        setError(`Could not register development cleanup: ${caught instanceof Error ? caught.message : String(caught)}`);
      }
    };
    void register(1);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [getCurrentJwt, sessionId]);

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const updateRunState = (message: OrbisMessage) => {
    if (message.type === "state") {
      if (typeof message.started === "boolean") setRunStarted(message.started);
      if (typeof message.paused === "boolean") setPaused(message.paused);
      if (message.has_image === false && !message.started) setImageStatus("");
    } else if (message.type === "generation_started") {
      setRunStarted(true);
      setPaused(false);
      if (message.image_conditioned === true) setImageStatus("Reference frame locked");
      if (message.image_conditioned === false && expectsImageForRun.current) {
        setImageStatus("Started without reference frame");
        setError("Orbis started without the uploaded reference image.");
      }
    } else if (message.type === "generation_paused") {
      setPaused(true);
    } else if (message.type === "generation_resumed") {
      setPaused(false);
    } else if (message.type === "generation_complete" || message.type === "generation_reset") {
      setRunStarted(false);
      setPaused(false);
    }
  };

  useReactorMessage((raw: unknown) => {
    const message = unwrapOrbisMessage(raw);

    if (message.type === "conditions_ready") {
      conditionsReadyResolver.current?.();
      conditionsReadyResolver.current = null;
    }
    if (message.type === "state" && message.has_image === true) {
      imageReadyResolver.current?.();
      imageReadyResolver.current = null;
    }
    if (message.type === "state" && message.available_resolutions) {
      const reported = message.available_resolutions.map(String);
      if (reported.length) {
        setAvailableResolutions(reported);
        setResolution((current) => (!current || reported.includes(current) ? current : ""));
      }
    }
    if (!disconnecting.current) updateRunState(message);
    if (message.type === "command_error") {
      setError(`${message.command || "command"}: ${message.reason || "rejected"}`);
      if (message.command === "start") setRunStarted(false);
    }
    if (message.type) setEvents((current) => [message.type!, ...current].slice(0, 12));
  });

  const waitForSignal = (
    resolver: { current: (() => void) | null },
    signalName: string,
  ) => {
    let timeout: ReturnType<typeof setTimeout>;
    const promise = new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => {
        resolver.current = null;
        reject(new Error(`Timed out waiting for Orbis ${signalName}.`));
      }, 18_000);
      resolver.current = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
    return {
      promise,
      cancel: () => {
        clearTimeout(timeout);
        resolver.current = null;
      },
    };
  };

  const startGeneration = async ({
    prompt: runPrompt,
    image: startImage = null,
    seed,
    audioPrompt = "",
  }: StartConfig) => {
    if (!runPrompt.trim()) throw new Error("Add a direction before creating an Echo.");
    if (runStarted) throw new Error("Reset the current memory before starting another Echo.");

    // Start every Echo from a clean model state so an earlier image/prompt cannot
    // silently leak into a new verified event. Resolution survives reset by model
    // design; image, prompt and seed do not.
    await sendCommand("reset", {});
    expectsImageForRun.current = Boolean(startImage);

    if (startImage) {
      const uploaded = await uploadFile(startImage, { name: startImage.name });
      const imageReady = waitForSignal(imageReadyResolver, "state.has_image");
      const rawReply = await sendCommand("set_image", { image: uploaded });
      if (!rawReply) {
        imageReady.cancel();
        throw new Error("Orbis did not accept the reference image.");
      }
      const reply = unwrapOrbisMessage(rawReply);
      if (reply.type === "command_error") {
        imageReady.cancel();
        throw new Error(`set_image: ${reply.reason || "rejected"}`);
      }
      if (reply.type !== "image_accepted") {
        imageReady.cancel();
        throw new Error(`Expected image_accepted, received ${reply.type || "an unknown reply"}.`);
      }
      await imageReady.promise;
      const dimensions = reply.width && reply.height ? ` · ${reply.width}×${reply.height}` : "";
      setImageStatus(`Reference accepted${dimensions}`);
      setEvents((current) => ["image_accepted", ...current].slice(0, 12));
    }

    if (resolution) await sendCommand("set_resolution", { resolution });
    if (typeof seed === "number" && Number.isFinite(seed) && seed >= 0) {
      await sendCommand("set_seed", { seed: Math.floor(seed) });
    }
    // Empty explicitly clears a previous run's sound override.
    await sendCommand("set_audio_prompt", { prompt: audioPrompt.trim() });

    const conditionsReady = waitForSignal(conditionsReadyResolver, "conditions_ready");
    const promptReply = await sendCommand("set_prompt", { prompt: runPrompt.trim() });
    if (!promptReply) {
      conditionsReady.cancel();
      throw new Error("Orbis did not accept the cinematic direction.");
    }
    const promptMessage = unwrapOrbisMessage(promptReply);
    if (promptMessage.type === "command_error") {
      conditionsReady.cancel();
      throw new Error(`set_prompt: ${promptMessage.reason || "rejected"}`);
    }

    await conditionsReady.promise;
    setEvents((current) => ["conditions_ready", ...current].slice(0, 12));
    await sendCommand("start", {});
    setRunStarted(true);
    setPaused(false);
  };

  const selectImage = (nextImage: File | null) => {
    setImage(nextImage);
    setImageStatus("");
  };

  const startRun = () => runAction(() => startGeneration({ prompt, image }));
  const startWithConfig = async (config: StartConfig) => {
    setPrompt(config.prompt);
    if (config.image !== undefined) setImage(config.image);
    return runAction(() => startGeneration(config));
  };

  const steerWithPrompt = (nextPrompt?: string) =>
    runAction(async () => {
      const value = (nextPrompt ?? prompt).trim();
      if (!value) throw new Error("Add a direction before steering.");
      setPrompt(value);
      await sendCommand("set_prompt", { prompt: value });
    });

  const disconnectSession = async () => {
    disconnecting.current = true;
    setMediaEnabled(false);
    setRunStarted(false);
    setPaused(false);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      const disconnected = await runAction(() => disconnect());
      if (disconnected) {
        if (process.env.NODE_ENV === "development" && sessionId) {
          try {
            await fetch("/api/session-registry", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId }),
            });
          } catch {
            // The next development cleanup sweep removes stale entries.
          }
        }
        clearJwt();
      }
    } finally {
      disconnecting.current = false;
    }
  };

  const connectSession = () =>
    runAction(async () => {
      setMediaEnabled(true);
      await connect();
    });

  return {
    status,
    connected,
    mediaEnabled: connected && mediaEnabled,
    controlsBusy: busy,
    runStarted,
    paused,
    muted,
    prompt,
    image,
    imageStatus,
    resolution,
    availableResolutions,
    error,
    events,
    connectSession,
    disconnectSession,
    toggleMuted: () => setMuted((current) => !current),
    setMuted,
    setPrompt,
    selectImage,
    setResolution,
    startRun,
    startWithConfig,
    steer: () => steerWithPrompt(),
    steerWithPrompt,
    pause: () => runAction(() => sendCommand("pause", {})),
    resume: () => runAction(() => sendCommand("resume", {})),
    reset: () => runAction(() => sendCommand("reset", {})),
  };
}

export type OrbisSession = ReturnType<typeof useOrbisSession>;
