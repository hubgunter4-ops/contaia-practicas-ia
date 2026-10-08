import test from "node:test";
import assert from "node:assert/strict";
import { createSpeechSpeaker, prepareSpeechText } from "../src/tutor/speech.js";

test("prepara texto para voz en español", () => {
  assert.equal(prepareSpeechText("**3/4** en `MXN`"), "3 sobre 4 en MXN");
});

test("la voz permanece apagada hasta activación expresa y puede cancelarse", () => {
  class FakeUtterance { constructor(text) { this.text = text; } }
  const synth = {
    speaking: false,
    pending: false,
    voices: [{ lang: "es-MX" }],
    queue: [],
    cancelled: 0,
    getVoices() { return this.voices; },
    speak(utterance) { this.queue.push(utterance); },
    cancel() { this.cancelled += 1; this.queue = []; },
  };
  const speaker = createSpeechSpeaker({ synth, Utterance: FakeUtterance });
  speaker.say("No debe hablar todavía.");
  assert.equal(synth.queue.length, 0);
  assert.equal(speaker.setEnabled(true), true);
  speaker.say("Ahora sí.");
  assert.equal(synth.queue.length, 1);
  assert.equal(synth.queue[0].lang, "es-MX");
  assert.equal(speaker.setEnabled(false), false);
  assert.equal(synth.cancelled, 1);
});

test("detecta ausencia de Web Speech API", () => {
  const speaker = createSpeechSpeaker({ synth: null, Utterance: null });
  assert.equal(speaker.supported, false);
  assert.equal(speaker.setEnabled(true), false);
});
