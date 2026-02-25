let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function playTone(frequencies: number[], duration: number): void {
  try {
    const ctx = getAudioContext();
    const startTime = ctx.currentTime;
    const stepDuration = duration / frequencies.length;

    for (let i = 0; i < frequencies.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequencies[i];
      gain.gain.setValueAtTime(0.15, startTime + i * stepDuration);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + (i + 1) * stepDuration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startTime + i * stepDuration);
      osc.stop(startTime + (i + 1) * stepDuration);
    }
  } catch {
    // Audio context may not be available — silently fail
  }
}

export function playConnectSound(): void {
  playTone([440, 660], 0.3);
}

export function playDisconnectSound(): void {
  playTone([660, 440], 0.3);
}
