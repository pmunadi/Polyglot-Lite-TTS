
import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceOption, SpeechSettings } from "./types";
import { decodeBase64, decodeAudioData } from "./utils";

export class GeminiTTSService {
  private ai: GoogleGenAI;
  private audioContext: AudioContext | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  private getAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return this.audioContext;
  }

  async generateSpeechData(text: string, voice: VoiceOption): Promise<{ buffer: AudioBuffer, raw: Uint8Array }> {
    const ctx = this.getAudioContext();
    
    // Minimalist prompt for faster processing
    const prompt = `Read naturally (ID/EN mix): "${text}"`;

    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { 
              voiceName: voice.baseVoice 
            },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data received");

    const audioBytes = decodeBase64(base64Audio);
    const audioBuffer = await decodeAudioData(audioBytes, ctx);

    return { buffer: audioBuffer, raw: audioBytes };
  }

  async playAudio(audioBuffer: AudioBuffer, settings: SpeechSettings): Promise<void> {
    const ctx = this.getAudioContext();
    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    
    source.buffer = audioBuffer;
    source.playbackRate.value = settings.speed;
    
    // Increased detune for more significant pitch shift while remaining human-like
    if (settings.pitch === 'low') {
      source.detune.value = -350; // Noticeably lower
    } else if (settings.pitch === 'high') {
      source.detune.value = 350;  // Noticeably higher
    } else {
      source.detune.value = 0;
    }

    gainNode.gain.value = settings.volume;
    
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    source.start();
  }
}
