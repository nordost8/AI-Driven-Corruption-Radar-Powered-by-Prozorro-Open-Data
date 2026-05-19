"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function SonarAudioControl(props: {
  riskIndex: number;
  riskSignals: number;
}) {
  const [enabled, setEnabled] = useState(false);
  const audioRef = useRef<{
    context: AudioContext;
    hum: OscillatorNode;
    humGain: GainNode;
    pingTimer: number | null;
  } | null>(null);

  const pingInterval = getPingInterval(props.riskIndex, props.riskSignals);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.pingTimer !== null) {
      window.clearInterval(audio.pingTimer);
    }
    audio.hum.stop();
    void audio.context.close();
    audioRef.current = null;
  }, []);

  const playPing = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const ping = audio.context.createOscillator();
    const pingGain = audio.context.createGain();
    const now = audio.context.currentTime;

    ping.type = "sine";
    ping.frequency.setValueAtTime(720, now);
    ping.frequency.exponentialRampToValueAtTime(360, now + 0.65);
    pingGain.gain.setValueAtTime(0.0001, now);
    pingGain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
    ping.connect(pingGain);
    pingGain.connect(audio.context.destination);
    ping.start(now);
    ping.stop(now + 0.75);
  }, []);

  const startAudio = useCallback(() => {
    if (audioRef.current) return;

    const context = new AudioContext();
    const hum = context.createOscillator();
    const humGain = context.createGain();

    hum.type = "sine";
    hum.frequency.value = 52;
    humGain.gain.value = 0.025;
    hum.connect(humGain);
    humGain.connect(context.destination);
    hum.start();

    audioRef.current = {
      context,
      hum,
      humGain,
      pingTimer: null,
    };
  }, []);

  const syncPingTimer = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.pingTimer !== null) {
      window.clearInterval(audio.pingTimer);
      audio.pingTimer = null;
    }

    if (pingInterval === null) return;

    playPing();
    audio.pingTimer = window.setInterval(playPing, pingInterval);
  }, [pingInterval, playPing]);

  useEffect(() => stopAudio, [stopAudio]);
  useEffect(() => {
    if (!enabled) return;
    syncPingTimer();
  }, [enabled, syncPingTimer]);

  const toggleSonar = useCallback(() => {
    const nextEnabled = !enabled;

    if (nextEnabled) {
      startAudio();
    } else {
      stopAudio();
    }

    setEnabled(nextEnabled);
  }, [enabled, startAudio, stopAudio]);

  return (
    <button
      aria-label={`Sonar ${enabled ? "on" : "off"}`}
      className={`rounded-md border px-3 py-2 text-xs tracking-[0.12em] uppercase ${
        enabled
          ? "border-emerald-400/60 bg-emerald-400/12 text-emerald-200"
          : "border-slate-800 bg-slate-950/50 text-slate-500 hover:text-slate-300"
      }`}
      onClick={toggleSonar}
      type="button"
    >
      Sonar {enabled ? "on" : "off"}
    </button>
  );
}

function getPingInterval(riskIndex: number, riskSignals: number) {
  if (riskSignals <= 0 || riskIndex < 40) return null;
  if (riskIndex >= 75) return 3000;
  if (riskIndex >= 60) return 5000;
  return 8000;
}
