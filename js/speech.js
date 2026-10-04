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
    this.continuous = false;
    this.transcript = "";
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
      this.transcript = "";
      this.isListening = true;
      if (this.onStart) this.onStart();
    };

    this.recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1][0];
      if (this.continuous) {
        let full = "";
        for (let i = 0; i < event.results.length; i++) {
          full += event.results[i][0].transcript;
        }
        this.transcript = full.trim();
      } else {
        this.transcript = last.transcript;
      }
      if (this.onResult) this.onResult(this.transcript, last.confidence);
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

  setContinuous(continuous) {
    this.continuous = Boolean(continuous);
    if (this.recognition) this.recognition.continuous = this.continuous;
  }

  reset() {
    this.transcript = "";
  }

  start() {
    if (!this.recognition) {
      throw new Error("Speech Recognition is not supported in this browser.");
    }
    if (this.isListening) return;
    this.transcript = "";
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