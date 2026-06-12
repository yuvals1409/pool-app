const canVibrate = () => typeof navigator !== "undefined" && "vibrate" in navigator;

export function scanHaptic(success) {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(success ? [10, 40, 10] : [30, 60, 30]);
  } catch {
    /* ignore */
  }
}

let audioCtx;

function getAudioContext() {
  if (!audioCtx && typeof AudioContext !== "undefined") {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function scanSound(success) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = success ? 880 : 220;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    /* ignore */
  }
}

export function triggerScanFeedback(success) {
  scanHaptic(success);
  scanSound(success);
}
