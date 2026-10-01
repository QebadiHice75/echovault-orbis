"use client";

import { ReactorView } from "@reactor-team/js-sdk";
import { useEffect, useMemo, useRef, useState } from "react";

import type { OrbisSession } from "@/hooks/use-orbis-session";

type Props = {
  session: OrbisSession;
  title: string;
  echoId: string;
  onRecordingChange: (blob: Blob | null) => void;
};

export function EchoPlayer({ session, title, echoId, onRecordingChange }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState("");
  const [recordingError, setRecordingError] = useState("");

  useEffect(() => () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl]);

  const playerLabel = useMemo(() => {
    if (session.runStarted && session.paused) return "MEMORY SUSPENDED";
    if (session.runStarted) return "LIVE MEMORY";
    if (session.connected) return "ORBIS READY";
    return "VAULT OFFLINE";
  }, [session.connected, session.paused, session.runStarted]);

  const startRecording = () => {
    setRecordingError("");
    const video = stageRef.current?.querySelector("video");
    if (!video) {
      setRecordingError("The live video track is not ready yet.");
      return;
    }
    const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
    if (!capture || typeof MediaRecorder === "undefined") {
      setRecordingError("Live capture is not supported in this browser. Chrome or Edge is recommended.");
      return;
    }

    // Reactor can render audio as a separate media element. Build one recording
    // stream from the visible video plus any live audio track we can capture.
    const videoStream = capture.call(video);
    const stream = new MediaStream(videoStream.getVideoTracks());
    const embeddedAudio = videoStream.getAudioTracks();
    for (const track of embeddedAudio) stream.addTrack(track);

    if (!embeddedAudio.length) {
      const audio = stageRef.current?.querySelector("audio") as
        | (HTMLAudioElement & { captureStream?: () => MediaStream })
        | null;
      const audioCapture = audio?.captureStream;
      if (audio && audioCapture) {
        const audioStream = audioCapture.call(audio);
        for (const track of audioStream.getAudioTracks()) stream.addTrack(track);
      }
    }

    const mimeCandidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
      onRecordingChange(blob);
      setRecording(false);
    };
    recorder.onerror = () => {
      setRecordingError("The browser stopped the recording unexpectedly.");
      setRecording(false);
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const downloadRecording = () => {
    if (!recordedUrl) return;
    const anchor = document.createElement("a");
    anchor.href = recordedUrl;
    anchor.download = `${echoId.toLowerCase()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "memory"}.webm`;
    anchor.click();
  };

  return (
    <div className="memory-stage-wrap">
      <div className="memory-stage" ref={stageRef}>
        {session.mediaEnabled ? (
          <ReactorView
            track="main_video"
            audioTrack="main_audio"
            muted={session.muted}
            videoObjectFit="cover"
          />
        ) : null}
        <div className={`memory-stage-placeholder ${session.runStarted ? "is-hidden" : ""}`}>
          <div className="memory-aperture" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p>{session.connected ? "The stream is listening for a direction." : "Connect the World Engine to open the memory."}</p>
        </div>
        <div className="stage-topline">
          <span className="live-dot" />
          <span>{playerLabel}</span>
          <span className="stage-spacer" />
          <span>{echoId}</span>
        </div>
        <div className="stage-title">
          <small>CINEMATIC INTERPRETATION</small>
          <strong>{title || "Untitled Echo"}</strong>
        </div>
      </div>

      <div className="stage-actions">
        <button className="quiet-button" type="button" onClick={session.toggleMuted}>
          {session.muted ? "Enable sound" : "Mute sound"}
        </button>
        {!recording ? (
          <button className="quiet-button" type="button" onClick={startRecording} disabled={!session.runStarted}>
            Record clip
          </button>
        ) : (
          <button className="record-button" type="button" onClick={stopRecording}>
            <span /> Stop recording
          </button>
        )}
        <button className="quiet-button" type="button" onClick={downloadRecording} disabled={!recordedUrl}>
          Download video
        </button>
      </div>
      {recordingError ? <p className="inline-error">{recordingError}</p> : null}
    </div>
  );
}
