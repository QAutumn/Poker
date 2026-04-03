import { useEffect, useRef } from "react";
import type { HandState } from "@poker/shared";

const createTone = (
  context: AudioContext,
  {
    frequency,
    duration,
    type,
    gain,
  }: { frequency: number; duration: number; type: OscillatorType; gain: number },
) => {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  envelope.gain.setValueAtTime(gain, context.currentTime);
  envelope.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(envelope);
  envelope.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
};

const playCardSound = (context: AudioContext) => {
  createTone(context, { frequency: 620, duration: 0.05, type: "triangle", gain: 0.028 });
};

const playChipSound = (context: AudioContext) => {
  createTone(context, { frequency: 180, duration: 0.08, type: "square", gain: 0.018 });
  setTimeout(() => createTone(context, { frequency: 260, duration: 0.06, type: "triangle", gain: 0.014 }), 24);
};

const playRevealSound = (context: AudioContext) => {
  createTone(context, { frequency: 420, duration: 0.1, type: "sine", gain: 0.02 });
  setTimeout(() => createTone(context, { frequency: 520, duration: 0.12, type: "triangle", gain: 0.014 }), 80);
};

export const useTableAudio = (session: HandState | undefined, enabled: boolean) => {
  const audioRef = useRef<AudioContext | null>(null);
  const handRef = useRef<number>(0);
  const streetRef = useRef<string>("");
  const logLengthRef = useRef<number>(0);

  useEffect(() => {
    if (!session || !enabled) return;
    if (!audioRef.current) {
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      audioRef.current = new AudioCtor();
    }

    const context = audioRef.current;
    if (context.state === "suspended") void context.resume();

    if (handRef.current !== session.handNumber) {
      handRef.current = session.handNumber;
      const holeCards = Math.min(session.players.length * 2, 12);
      Array.from({ length: holeCards }).forEach((_, index) => {
        setTimeout(() => playCardSound(context), index * 78);
      });
    }

    if (streetRef.current !== session.street) {
      const previousStreet = streetRef.current;
      streetRef.current = session.street;
      const revealCount =
        session.street === "flop" ? 3 : session.street === "turn" || session.street === "river" ? 1 : 0;
      if (previousStreet && revealCount > 0) {
        Array.from({ length: revealCount }).forEach((_, index) => {
          setTimeout(() => playCardSound(context), index * 90);
        });
        setTimeout(() => playRevealSound(context), revealCount * 90);
      }
    }

    if (logLengthRef.current !== 0 && session.actionLog.length > logLengthRef.current) {
      const delta = session.actionLog.length - logLengthRef.current;
      Array.from({ length: delta }).forEach((_, index) => {
        setTimeout(() => playChipSound(context), index * 110);
      });
    }
    logLengthRef.current = session.actionLog.length;
  }, [enabled, session]);
};
