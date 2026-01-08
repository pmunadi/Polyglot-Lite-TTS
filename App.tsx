
import React, { useState, useEffect, useRef } from 'react';
import { VOICES } from './constants';
import { VoiceOption, SpeechSettings } from './types';
import { GeminiTTSService } from './geminiService';
import { pcmToWav } from './utils';

const ttsService = new GeminiTTSService();
const MAX_CHARS = 1000;

// Speed compression: Maps UI 1.0 -> 2.0 to Actual 1.0 -> 1.4 for a natural feel
const mapUiSpeedToInternal = (uiSpeed: number) => {
  return 1.0 + (uiSpeed - 1.0) * 0.4;
};

const App: React.FC = () => {
  const [text, setText] = useState('Halo everyone! Selamat datang di SWARA. Pilih pembicara favorit Anda dan sesuaikan nadanya.');
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VOICES[0]);
  const [settings, setSettings] = useState<SpeechSettings>({
    speed: 1.0, 
    pitch: 'normal',
    volume: 1.0
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<{ blob: Blob, buffer: AudioBuffer } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Refs for Web Audio Control
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    stopPlayback();
    setGeneratedAudio(null);
  }, [text, selectedVoice, settings.pitch]);

  const stopPlayback = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch(e) {}
      audioSourceRef.current = null;
    }
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    setIsPlaying(false);
    setCurrentTime(0);
    pausedAtRef.current = 0;
  };

  const updateProgress = () => {
    if (!isPlaying || !generatedAudio) return;
    
    const ctx = (ttsService as any).getAudioContext();
    const internalSpeed = mapUiSpeedToInternal(settings.speed);
    const elapsed = (ctx.currentTime - startTimeRef.current) * internalSpeed;
    
    if (elapsed >= generatedAudio.buffer.duration) {
      setIsPlaying(false);
      setCurrentTime(generatedAudio.buffer.duration);
      cancelAnimationFrame(requestRef.current!);
      return;
    }
    
    setCurrentTime(elapsed);
    requestRef.current = requestAnimationFrame(updateProgress);
  };

  const handlePlayPause = async () => {
    if (!generatedAudio) return;
    const ctx = (ttsService as any).getAudioContext();
    const internalSpeed = mapUiSpeedToInternal(settings.speed);

    if (isPlaying) {
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current = null;
      }
      pausedAtRef.current = (ctx.currentTime - startTimeRef.current) * internalSpeed;
      setIsPlaying(false);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    } else {
      const source = ctx.createBufferSource();
      source.buffer = generatedAudio.buffer;
      source.playbackRate.value = internalSpeed;
      
      // Detune value (cents)
      if (settings.pitch === 'low') source.detune.value = -350;
      else if (settings.pitch === 'high') source.detune.value = 350;
      else source.detune.value = 0;

      const gainNode = ctx.createGain();
      gainNode.gain.value = settings.volume;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      const offset = pausedAtRef.current >= generatedAudio.buffer.duration ? 0 : pausedAtRef.current;
      
      source.start(0, offset / internalSpeed);
      startTimeRef.current = ctx.currentTime - (offset / internalSpeed);
      audioSourceRef.current = source;
      setIsPlaying(true);
      requestRef.current = requestAnimationFrame(updateProgress);

      source.onended = () => {
        if (audioSourceRef.current === source) {
          setIsPlaying(false);
          const currentElapsed = (ctx.currentTime - startTimeRef.current) * internalSpeed;
          if (currentElapsed >= generatedAudio.buffer.duration - 0.1) {
             setCurrentTime(generatedAudio.buffer.duration);
             pausedAtRef.current = 0;
          }
        }
      };
    }
  };

  const handleMulai = async () => {
    if (!text.trim() || !selectedVoice) return;
    stopPlayback();
    setIsProcessing(true);
    setError(null);
    try {
      const { buffer, raw } = await ttsService.generateSpeechData(text, selectedVoice);
      const wavBlob = pcmToWav(raw);
      setGeneratedAudio({ blob: wavBlob, buffer });
      setDuration(buffer.duration);
      setCurrentTime(0);
      pausedAtRef.current = 0;
      
      setTimeout(() => handlePlayPause(), 50);
    } catch (err: any) {
      setError('Gagal memproses audio. Periksa koneksi internet Anda.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleHapusTeks = () => {
    stopPlayback();
    setText('');
    setGeneratedAudio(null);
    setError(null);
    setSettings({ speed: 1.0, pitch: 'normal', volume: 1.0 });
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!generatedAudio) return;
    const url = URL.createObjectURL(generatedAudio.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swara-tts-${selectedVoice.id}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const charCount = text.length;
  const isOverLimit = charCount > MAX_CHARS;
  const speedTicks = Array.from({ length: 11 }, (_, i) => (1.0 + i * 0.1).toFixed(1));

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b] font-sans p-4 md:p-8 flex flex-col items-center justify-center">
      <div className="max-w-4xl w-full space-y-6 flex-grow flex flex-col justify-center">
        <header className="text-center space-y-2">
          <div className="inline-block bg-indigo-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-[0.2em] mb-2 shadow-lg shadow-indigo-100">AI Voice Studio</div>
          <h1 className="text-5xl font-black text-slate-900 uppercase tracking-tighter">SWARA</h1>
          <p className="text-slate-400 text-sm font-medium">Campuran Bahasa Indonesia & Inggris Secara Natural</p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Panel */}
          <div className="lg:col-span-7 bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden p-6 md:p-8 space-y-8">
            <div className="relative">
              <div className="flex justify-between items-center mb-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Teks Input</label>
                <button 
                  onClick={handleHapusTeks}
                  className="text-[10px] font-black uppercase text-red-500 hover:text-red-700 transition-colors flex items-center gap-1.5 px-3 py-1.5 bg-red-50 rounded-full"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  Hapus & Reset
                </button>
              </div>
              <textarea
                className={`w-full h-56 p-6 bg-slate-50 border-2 rounded-3xl focus:ring-8 outline-none transition-all resize-none text-xl leading-relaxed ${
                  isOverLimit ? 'border-red-400 focus:ring-red-100' : 'border-slate-100 focus:ring-indigo-100 focus:border-indigo-400'
                }`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Tulis kalimat campuran di sini..."
              />
              <div className={`absolute bottom-6 right-6 text-[10px] font-black px-3 py-1.5 rounded-full shadow-sm ${isOverLimit ? 'bg-red-500 text-white' : 'bg-slate-900 text-white'}`}>
                {charCount} / {MAX_CHARS}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-slate-50">
              {/* Kecepatan Slider */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Kecepatan</label>
                  <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">{settings.speed.toFixed(1)}x</span>
                </div>
                <div className="relative pt-2">
                  <div className="relative w-full h-2 bg-slate-100 rounded-full flex justify-between px-1 items-center">
                    {speedTicks.map(val => (
                      <div key={val} className={`w-[1px] h-3 ${parseFloat(settings.speed.toFixed(1)) >= parseFloat(val) ? 'bg-indigo-400' : 'bg-slate-300'}`}></div>
                    ))}
                  </div>
                  <input
                    type="range" min="1.0" max="2.0" step="0.1" value={settings.speed}
                    onChange={(e) => setSettings({...settings, speed: parseFloat(e.target.value)})}
                    className="absolute inset-0 w-full h-2 bg-transparent appearance-none cursor-pointer accent-indigo-600 z-10 -top-0.5"
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase">
                  <span>Lambat</span>
                  <span>Cepat</span>
                </div>
              </div>

              {/* Nada Suara Buttons */}
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nada Suara</label>
                <div className="flex bg-slate-50 p-1.5 rounded-2xl gap-1.5">
                  {[
                    { key: 'low', label: 'Rendah' },
                    { key: 'normal', label: 'Normal' },
                    { key: 'high', label: 'Tinggi' }
                  ].map(p => (
                    <button
                      key={p.key}
                      onClick={() => setSettings({...settings, pitch: p.key as any})}
                      className={`flex-1 text-[10px] font-black py-2.5 rounded-xl transition-all ${settings.pitch === p.key ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:bg-slate-200'}`}
                    >
                      {p.label.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleMulai}
              disabled={isProcessing || isOverLimit || !text.trim()}
              className={`w-full py-5 rounded-[2rem] font-black text-xl text-white shadow-2xl transition-all transform active:scale-95 flex items-center justify-center gap-3 ${
                isProcessing || isOverLimit || !text.trim() ? 'bg-slate-200 cursor-not-allowed shadow-none' : 'bg-slate-900 hover:bg-indigo-700 shadow-indigo-200'
              }`}
            >
              {isProcessing ? (
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>MEMPROSES...</span>
                </div>
              ) : 'MULAI GENERATE'}
            </button>
          </div>

          {/* Right Panel */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 p-6 space-y-4">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Pilih Pembicara</label>
              <div className="grid grid-cols-1 gap-3">
                {VOICES.map(v => (
                  <div 
                    key={v.id}
                    onClick={() => setSelectedVoice(v)}
                    className={`cursor-pointer p-4 rounded-3xl border-2 transition-all flex items-center gap-4 group ${
                      selectedVoice.id === v.id ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'border-slate-50 hover:border-slate-200 bg-white'
                    }`}
                  >
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 transition-all ${selectedVoice.id === v.id ? 'bg-indigo-600 text-white scale-110' : 'bg-slate-100 text-slate-400'}`}>
                      {v.gender === 'male' ? (
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" /></svg>
                      ) : (
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1h8V6a4 4 0 00-4-4zm6 5H4v11h12V7z" clipRule="evenodd" /></svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-black text-base text-slate-800">{v.name}</div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">{v.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Audio Player */}
            {generatedAudio && !isProcessing && (
              <div className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-2xl animate-in slide-in-from-right-10 duration-500">
                <div className="flex items-center gap-5">
                  <button 
                    onClick={handlePlayPause}
                    className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shrink-0 hover:scale-110 active:scale-90 transition-all shadow-xl shadow-indigo-500/20"
                  >
                    {isPlaying ? (
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    ) : (
                      <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                    )}
                  </button>

                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Audio Player</span>
                      <span className="text-[10px] font-black text-slate-400 tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>
                    </div>
                    <div className="relative w-full h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="absolute top-0 left-0 h-full bg-indigo-500 transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                        style={{ width: `${(currentTime / duration) * 100}%` }}
                      />
                    </div>
                  </div>

                  <button 
                    onClick={handleDownload}
                    className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 hover:bg-white/10 transition-all text-emerald-400 hover:text-emerald-300"
                    title="Unduh WAV"
                  >
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {error && (
          <div className="bg-red-50 text-red-600 p-5 rounded-[2rem] text-center text-sm font-black border-2 border-red-100 shadow-sm animate-bounce-short">
            {error}
          </div>
        )}

        <footer className="text-center py-4 mt-4">
          <p className="text-[10px] text-slate-400 font-medium tracking-wide">
            Copyright © 2026 Pramudya Munadi. All rights reserved.
          </p>
        </footer>
      </div>

      <style>{`
        @keyframes bounce-short {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .animate-bounce-short { animation: bounce-short 1s ease-in-out 2; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
};

export default App;
