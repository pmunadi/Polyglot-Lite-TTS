
export type VoiceGender = 'male' | 'female';
export type Language = 'ID' | 'EN';

export interface VoiceOption {
  id: string;
  name: string;
  gender: VoiceGender;
  language: Language;
  baseVoice: string;
  description: string;
}

export interface SpeechSettings {
  speed: number;
  pitch: 'low' | 'normal' | 'high';
  volume: number;
}
