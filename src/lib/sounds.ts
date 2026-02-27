// Sound effects manager using Web Audio API
let audioContext: AudioContext | null = null;
let soundEnabled = true;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
};

export const setSoundEnabled = (enabled: boolean) => {
  soundEnabled = enabled;
};

export const isSoundEnabled = () => soundEnabled;

const playTone = (frequency: number, duration: number, type: OscillatorType = "sine", volume = 0.3) => {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Ignore audio errors
  }
};

export const playCardSound = () => playTone(800, 0.1, "sine", 0.2);
export const playDrawSound = () => playTone(400, 0.15, "triangle", 0.2);
export const playUnoSound = () => {
  playTone(523, 0.15, "square", 0.3);
  setTimeout(() => playTone(659, 0.15, "square", 0.3), 150);
  setTimeout(() => playTone(784, 0.2, "square", 0.3), 300);
};
export const playTurnSound = () => playTone(600, 0.08, "sine", 0.15);
export const playTimerWarning = () => playTone(440, 0.05, "square", 0.1);
export const playWinSound = () => {
  [523, 587, 659, 784, 880].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.2, "sine", 0.25), i * 120);
  });
};
export const playAttackSound = () => {
  playTone(200, 0.3, "sawtooth", 0.2);
};

// Haptic feedback
export const triggerHaptic = (pattern: "light" | "medium" | "heavy" = "medium") => {
  if (!navigator.vibrate) return;
  const patterns = {
    light: [30],
    medium: [50],
    heavy: [100, 30, 100],
  };
  navigator.vibrate(patterns[pattern]);
};
