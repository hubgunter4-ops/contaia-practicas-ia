export function prepareSpeechText(text) {
  return String(text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(\d+)\s*\/\s*(\d+)/g, "$1 sobre $2")
    .replace(/[$*_~#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createSpeechSpeaker({
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  onStateChange = () => {},
} = {}) {
  const supported = Boolean(synth && Utterance);
  let enabled = false;

  function getSpanishVoice() {
    const voices = synth?.getVoices?.() || [];
    return voices.find((voice) => /^es[-_]MX$/i.test(voice.lang))
      || voices.find((voice) => /^es[-_]419$/i.test(voice.lang))
      || voices.find((voice) => /^es[-_]/i.test(voice.lang))
      || null;
  }

  function stop() {
    if (supported) synth.cancel();
    onStateChange("idle");
  }

  function say(text) {
    const cleaned = prepareSpeechText(text);
    if (!cleaned || !supported || !enabled) return;
    const utterance = new Utterance(cleaned);
    const voice = getSpanishVoice();
    utterance.lang = voice?.lang || "es-MX";
    if (voice) utterance.voice = voice;
    utterance.rate = 0.98;
    utterance.pitch = 1.04;
    utterance.onstart = () => onStateChange("speaking");
    utterance.onend = () => onStateChange("idle");
    utterance.onerror = () => onStateChange("idle");
    synth.speak(utterance);
  }

  return {
    supported,
    get enabled() { return enabled; },
    setEnabled(value) {
      enabled = Boolean(value && supported);
      if (!enabled) stop();
      return enabled;
    },
    say,
    stop,
  };
}
