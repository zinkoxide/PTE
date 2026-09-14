/* ==========================================
   PTE Trainer
   Speech Recognition Engine
   ========================================== */

"use strict";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

export class SpeechEngine {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.onStart = null;
    this.onResult = null;
    this.onEnd = null;
    this.onError = null;

    if (!SpeechRecognition) {
      console.warn("Speech Recognition is not supported.");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = "en-US";
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onStart) this.onStart();
    };

    this.recognition.onresult = (event) => {
      const first = event.results[0][0];
      if (this.onResult) {
        this.onResult(first.transcript, first.confidence);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onEnd) this.onEnd();
    };

    this.recognition.onerror = (event) => {
      this.isListening = false;
      console.error("Speech recognition error:", event.error);
      if (this.onError) this.onError(event.error);
    };
  }

  start() {
    if (!this.recognition) {
      throw new Error("Speech Recognition is not supported in this browser.");
    }
    if (this.isListening) return;
    this.recognition.start();
  }

  stop() {
    if (!this.recognition || !this.isListening) return;
    this.recognition.stop();
  }

  isSupported() {
    return Boolean(this.recognition);
  }
}