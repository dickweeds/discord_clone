interface VADInstance {
  audioContext: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  gainNode: GainNode;
  intervalId: ReturnType<typeof setInterval>;
}

const SPEAKING_THRESHOLD = 15;
const HOLD_TIME_MS = 250;
const POLL_INTERVAL_MS = 50;

let localVAD: VADInstance | null = null;
const remoteVADs = new Map<string, VADInstance>();

function createVADInstance(
  stream: MediaStream,
  onSpeakingChange: (speaking: boolean) => void,
): VADInstance | null {
  let audioContext: AudioContext | null = null;
  try {
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    source.connect(analyser);

    // Connect through a silent gain node to destination so AnalyserNode gets data
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0;
    analyser.connect(gainNode);
    gainNode.connect(audioContext.destination);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let isSpeaking = false;
    let lastSpeakingTime = 0;

    const intervalId = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);

      const sum = dataArray.reduce((acc, val) => acc + val * val, 0);
      const rms = Math.sqrt(sum / dataArray.length);

      if (rms > SPEAKING_THRESHOLD) {
        if (!isSpeaking) {
          isSpeaking = true;
          onSpeakingChange(true);
        }
        lastSpeakingTime = Date.now();
      } else if (isSpeaking && Date.now() - lastSpeakingTime > HOLD_TIME_MS) {
        isSpeaking = false;
        onSpeakingChange(false);
      }
    }, POLL_INTERVAL_MS);

    return { audioContext, analyser, source, gainNode, intervalId };
  } catch (err) {
    console.warn('[vadService] Failed to create VAD instance:', (err as Error).message);
    audioContext?.close().catch(() => {});
    return null;
  }
}

function destroyVADInstance(instance: VADInstance): void {
  clearInterval(instance.intervalId);
  instance.source.disconnect();
  instance.analyser.disconnect();
  instance.gainNode.disconnect();
  instance.audioContext.close().catch((err) => {
    console.warn('[vadService] AudioContext close failed:', err);
  });
}

export function startLocalVAD(
  stream: MediaStream,
  onSpeakingChange: (speaking: boolean) => void,
): void {
  stopLocalVAD();
  localVAD = createVADInstance(stream, onSpeakingChange);
  // null means VAD creation failed — voice still works, just no speaking indicator
}

export function startRemoteVAD(
  consumer: { track: MediaStreamTrack },
  peerId: string,
  onSpeakingChange: (peerId: string, speaking: boolean) => void,
): void {
  stopRemoteVAD(peerId);
  const stream = new MediaStream([consumer.track]);
  const instance = createVADInstance(stream, (speaking) => {
    onSpeakingChange(peerId, speaking);
  });
  if (instance) {
    remoteVADs.set(peerId, instance);
  }
}

export function stopLocalVAD(): void {
  if (localVAD) {
    destroyVADInstance(localVAD);
    localVAD = null;
  }
}

export function stopRemoteVAD(peerId: string): void {
  const instance = remoteVADs.get(peerId);
  if (instance) {
    destroyVADInstance(instance);
    remoteVADs.delete(peerId);
  }
}

export function stopAllVAD(): void {
  stopLocalVAD();
  for (const [peerId] of remoteVADs) {
    stopRemoteVAD(peerId);
  }
}
