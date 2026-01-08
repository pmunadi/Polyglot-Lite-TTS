
import { VoiceOption } from './types';

export const VOICES: VoiceOption[] = [
  { id: 'm-1', name: 'Pria 1', gender: 'male', language: 'ID', baseVoice: 'Charon', description: 'Suara Dalam & Stabil' },
  { id: 'm-2', name: 'Pria 2', gender: 'male', language: 'EN', baseVoice: 'Puck', description: 'Suara Ceria & Energik' },
  { id: 'f-1', name: 'Wanita 1', gender: 'female', language: 'ID', baseVoice: 'Kore', description: 'Suara Jelas & Formal' },
  { id: 'f-2', name: 'Wanita 2', gender: 'female', language: 'EN', baseVoice: 'Zephyr', description: 'Suara Lembut & Kasual' },
];
