import React, { useRef, useEffect, useState } from 'react';
import { Square, ArrowUp, Paperclip, Mic, MicOff, X, FileText, Loader2, Search, Brain, ChevronDown, Check, Globe, Sparkles } from 'lucide-react';
import type { Attachment, Settings, SystemPrompt } from '../utils/storage';
import { Storage, PRESET_PROMPTS } from '../utils/storage';
import { localSpeech } from '../utils/localSpeech';

interface ComposerProps {
  input: string;
  onChangeInput: (text: string) => void;
  onSend: (attachments?: Attachment[]) => void;
  isGenerating: boolean;
  onStop: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  userPrompts?: string[];
  fontSize?: 'sm' | 'base' | 'lg';
  onError?: (message: React.ReactNode) => void;
  settings: Settings;
  onSettingsChanged?: (settings: Settings) => void;
  activePromptId: string;
  onSelectPromptId: (id: string) => void;
  customPrompts: SystemPrompt[];
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

export const Composer: React.FC<ComposerProps> = ({
  input,
  onChangeInput,
  onSend,
  isGenerating,
  onStop,
  inputRef,
  userPrompts = [],
  onError,
  settings,
  onSettingsChanged,
  activePromptId,
  onSelectPromptId,
  customPrompts
}) => {
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [tempInput, setTempInput] = useState('');

  // Speech-to-Text and File Upload States
  const [isRecording, setIsRecording] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [whisperStatus, setWhisperStatus] = useState('idle');
  const [whisperProgress, setWhisperProgress] = useState(0);

  const [thinkingDropdownOpen, setThinkingDropdownOpen] = useState(false);
  const [promptDropdownOpen, setPromptDropdownOpen] = useState(false);

  const getActivePromptName = () => {
    const all = [...PRESET_PROMPTS, ...customPrompts];
    const prompt = all.find(p => p.id === activePromptId);
    return prompt ? prompt.name : 'General Assistant';
  };

  const toggleSearch = () => {
    const nextSearch = !settings.isRagEnabled;
    const updatedSettings = { ...settings, isRagEnabled: nextSearch };
    Storage.saveSettings(updatedSettings);
    onSettingsChanged?.(updatedSettings);
  };

  const toggleWebSearch = () => {
    const nextWebSearch = !settings.isWebSearchEnabled;
    const updatedSettings = { ...settings, isWebSearchEnabled: nextWebSearch };
    Storage.saveSettings(updatedSettings);
    onSettingsChanged?.(updatedSettings);
  };

  const handleSelectThinking = (level: 'off' | 'low' | 'medium' | 'high') => {
    const updatedSettings = { ...settings, thinkingLevel: level };
    Storage.saveSettings(updatedSettings);
    onSettingsChanged?.(updatedSettings);
    setThinkingDropdownOpen(false);
  };

  useEffect(() => {
    const unsubStatus = localSpeech.subscribeStatus(setWhisperStatus);
    const unsubProgress = localSpeech.subscribeProgress(setWhisperProgress);
    return () => {
      unsubStatus();
      unsubProgress();
    };
  }, []);

  const engine = settings.speechToTextEngine || 'native';
  const isSpeechSupported = engine === 'local'
    ? typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
    : typeof window !== 'undefined' && !!((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

  // Auto-grow heights
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
    }
  }, [input, inputRef]);

  // Speech recognition API initial setup
  useEffect(() => {
    const SpeechRecognition = (window as unknown as { SpeechRecognition?: new () => ISpeechRecognition; webkitSpeechRecognition?: new () => ISpeechRecognition }).SpeechRecognition || 
                              (window as unknown as { SpeechRecognition?: new () => ISpeechRecognition; webkitSpeechRecognition?: new () => ISpeechRecognition }).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          onChangeInput(input ? `${input.trim()} ${finalTranscript.trim()}` : finalTranscript);
        }
      };

      rec.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error', event);
        setIsRecording(false);
        
        let errorDetail: React.ReactNode = 'Speech recognition failed.';
        if (event.error === 'not-allowed') {
          errorDetail = 'Microphone access is blocked. Please enable microphone permissions in your browser.';
        } else if (event.error === 'no-speech') {
          errorDetail = 'No speech was detected. Please check your mic and try again.';
        } else if (event.error === 'network') {
          errorDetail = (
            <span className="flex items-center gap-1.5 flex-wrap">
              <span>A network error occurred. Native speech recognition requires an internet connection.</span>
              <button
                onClick={() => {
                  const updatedSettings: Settings = { ...Storage.getSettings(), speechToTextEngine: 'local' };
                  Storage.saveSettings(updatedSettings);
                  onSettingsChanged?.(updatedSettings);
                  onError?.(
                    <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                      Switched to Local Whisper Speech-to-Text! Click the mic icon again to record locally.
                    </span>
                  );
                }}
                className="underline font-bold text-brand-400 hover:text-brand-300 cursor-pointer bg-transparent border-none p-0 inline-block transition active:scale-95 ml-1"
              >
                Switch to Local Whisper (Offline & Private)
              </button>
            </span>
          );
        } else if (event.error === 'aborted') {
          return; // Ignore manual abort
        }
        
        onError?.(errorDetail);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }
  }, [input, onChangeInput, onError, onSettingsChanged]);

  const toggleRecording = async () => {
    const engine = settings.speechToTextEngine || 'native';

    if (engine === 'local') {
      if (isRecording) {
        setIsRecording(false);
        setIsTranscribing(true);
        try {
          const audioData = await localSpeech.stopRecording();
          const transcribedText = await localSpeech.transcribe(audioData);
          if (transcribedText.trim()) {
            onChangeInput(input ? `${input.trim()} ${transcribedText.trim()}` : transcribedText.trim());
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Local transcription failed.';
          console.error('Local speech-to-text error:', err);
          onError?.(errorMsg);
        } finally {
          setIsTranscribing(false);
        }
      } else {
        try {
          await localSpeech.startRecording();
          setIsRecording(true);
        } catch (err) {
          console.error('Microphone access error:', err);
          onError?.('Microphone access is blocked. Please enable microphone permissions in your browser settings.');
        }
      }
    } else {
      if (!recognitionRef.current) {
        alert('Speech Recognition is not supported or permitted in this browser.');
        return;
      }

      if (isRecording) {
        recognitionRef.current.stop();
        setIsRecording(false);
      } else {
        setIsRecording(true);
        recognitionRef.current.start();
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const isImage = file.type.startsWith('image/');
      const reader = new FileReader();

      reader.onload = (event) => {
        const fileData = event.target?.result as string;
        if (!fileData) return;

        const newAttachment: Attachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          type: file.type || (isImage ? 'image/png' : 'text/plain'),
          data: fileData,
          size: file.size
        };

        setAttachments(prev => [...prev, newAttachment]);
      };

      if (isImage) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    let hasFiles = false;

    Array.from(items).forEach(item => {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          hasFiles = true;
          const isImage = file.type.startsWith('image/');
          const reader = new FileReader();

          reader.onload = (event) => {
            const fileData = event.target?.result as string;
            if (!fileData) return;

            const newAttachment: Attachment = {
              id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: file.name || `pasted-file-${Date.now()}.${isImage ? 'png' : 'txt'}`,
              type: file.type || (isImage ? 'image/png' : 'text/plain'),
              data: fileData,
              size: file.size
            };

            setAttachments(prev => [...prev, newAttachment]);
          };

          if (isImage) {
            reader.readAsDataURL(file);
          } else {
            reader.readAsText(file);
          }
        }
      }
    });

    if (hasFiles) {
      e.preventDefault();
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  const handleSend = () => {
    if ((input.trim() || attachments.length > 0) && !isGenerating) {
      onSend(attachments);
      setAttachments([]);
      setHistoryIndex(null);
      if (isRecording) {
        recognitionRef.current?.stop();
        setIsRecording(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }

    if (e.key === 'ArrowUp') {
      if (userPrompts.length === 0) return;

      if (input === '' || historyIndex !== null) {
        e.preventDefault();
        if (historyIndex === null) {
          setTempInput(input);
          const nextIdx = userPrompts.length - 1;
          setHistoryIndex(nextIdx);
          onChangeInput(userPrompts[nextIdx]);
        } else if (historyIndex > 0) {
          const nextIdx = historyIndex - 1;
          setHistoryIndex(nextIdx);
          onChangeInput(userPrompts[nextIdx]);
        }
      }
    }

    if (e.key === 'ArrowDown') {
      if (historyIndex !== null) {
        e.preventDefault();
        if (historyIndex < userPrompts.length - 1) {
          const nextIdx = historyIndex + 1;
          setHistoryIndex(nextIdx);
          onChangeInput(userPrompts[nextIdx]);
        } else {
          setHistoryIndex(null);
          onChangeInput(tempInput);
          setTempInput('');
        }
      }
    }
  };

  return (
    <div className="relative w-full max-w-2xl px-4 pb-6">
      
      {/* Floating Stop Generating Overlay */}
      {isGenerating && (
        <div className="absolute -top-11 left-1/2 -translate-x-1/2 animate-fade-in">
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 rounded-full border border-white/[0.05] bg-slate-900/90 hover:bg-slate-800 px-3.5 py-1 text-[10px] font-medium text-slate-300 shadow-xl backdrop-blur-md transition-all active:scale-95 cursor-pointer"
          >
            <Square className="h-2.5 w-2.5 fill-current text-red-500" />
            <span>Stop generating</span>
          </button>
        </div>
      )}

      {/* Attachments Preview Area */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 animate-fade-in select-none">
          {attachments.map(att => {
            const isImage = att.type.startsWith('image/');
            return (
              <div
                key={att.id}
                className="group relative flex items-center gap-1.5 rounded-lg border border-white/[0.04] bg-slate-900/60 p-1.5 text-[10px] text-slate-300 backdrop-blur-md"
              >
                {isImage ? (
                  <img
                    src={att.data}
                    alt={att.name}
                    className="h-7 w-7 rounded object-cover border border-white/[0.08]"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
                    <FileText className="h-4 w-4" />
                  </div>
                )}
                
                <div className="flex flex-col min-w-0 pr-5">
                  <span className="truncate max-w-[120px] font-semibold text-slate-200 leading-tight">{att.name}</span>
                  <span className="text-[8px] text-slate-500 mt-0.5">{(att.size / 1024).toFixed(1)} KB</span>
                </div>

                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-950/80 hover:bg-red-500 text-slate-400 hover:text-white border border-white/[0.05] transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                  aria-label="Remove attachment"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Input container */}
      <div className="relative rounded-xl border border-white/[0.035] bg-white/[0.015] p-1.5 backdrop-blur-xl transition-all duration-300 focus-within:border-white/[0.1] focus-within:shadow-[0_12px_32px_rgba(0,0,0,0.4)] flex flex-col gap-1.5">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            onChangeInput(e.target.value);
            if (e.target.value === '') {
              setHistoryIndex(null);
            }
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            isRecording 
              ? (engine === 'local' ? "Recording locally... Speak now, then click Mic to finish." : "Listening... Speak clearly now.") 
              : isTranscribing
                ? "Transcribing locally (Whisper)..."
                : "Ask anything..."
          }
          rows={1}
          style={{ resize: 'none', fontSize: 'var(--chat-font-size-user)' }}
          className="w-full bg-transparent px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none scrollbar-none leading-relaxed"
        />

        {/* Composer Bottom Toolbar */}
        <div className="border-t border-white/[0.03] pt-2 px-1.5 pb-0.5 flex items-center justify-between select-none">
          <div className="flex items-center gap-1.5">
            {/* System Prompt Picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPromptDropdownOpen(!promptDropdownOpen)}
                title={`Active Persona: ${getActivePromptName()}`}
                className={`flex h-7 px-2.5 items-center gap-1.5 rounded-lg text-[10px] font-semibold tracking-wide border transition-all duration-300 active:scale-90 cursor-pointer ${
                  activePromptId !== 'preset-general'
                    ? 'bg-amber-500/10 border-amber-500/25 text-amber-400 hover:bg-amber-500/20'
                    : 'border-white/[0.03] bg-white/[0.015] hover:bg-white/[0.05] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="truncate max-w-[80px]">
                  {getActivePromptName()}
                </span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>

              {promptDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setPromptDropdownOpen(false)} />
                  <div className="absolute left-0 bottom-8.5 z-30 w-48 rounded-lg border border-white/[0.04] bg-slate-900/95 p-1 shadow-2xl backdrop-blur-xl animate-fade-in max-h-52 overflow-y-auto">
                    <div className="px-2 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/[0.03] mb-1">
                      System Presets
                    </div>
                    {PRESET_PROMPTS.map((prompt) => (
                      <button
                        key={prompt.id}
                        type="button"
                        onClick={() => {
                          onSelectPromptId(prompt.id);
                          setPromptDropdownOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[10.5px] transition cursor-pointer ${
                          activePromptId === prompt.id
                            ? 'bg-amber-500/10 text-white font-semibold'
                            : 'text-slate-400 hover:bg-white/[0.02] hover:text-slate-200'
                        }`}
                      >
                        <span className="truncate pr-2">{prompt.name}</span>
                        {activePromptId === prompt.id && <Check className="h-3.5 w-3.5 text-amber-400" />}
                      </button>
                    ))}
                    {customPrompts.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/[0.03] mt-2 mb-1">
                          Custom Prompts
                        </div>
                        {customPrompts.map((prompt) => (
                          <button
                            key={prompt.id}
                            type="button"
                            onClick={() => {
                              onSelectPromptId(prompt.id);
                              setPromptDropdownOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[10.5px] transition cursor-pointer ${
                              activePromptId === prompt.id
                                ? 'bg-amber-500/10 text-white font-semibold'
                                : 'text-slate-400 hover:bg-white/[0.02] hover:text-slate-200'
                            }`}
                          >
                            <span className="truncate pr-2">{prompt.name}</span>
                            {activePromptId === prompt.id && <Check className="h-3.5 w-3.5 text-amber-400" />}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Separator line */}
            <div className="w-[1px] h-4 bg-white/[0.06] mx-0.5" />

            {/* Docs (RAG) Toggle */}
            <button
              type="button"
              onClick={toggleSearch}
              title={settings.isRagEnabled ? "Disable Local Docs context (RAG)" : "Enable Local Docs context (RAG)"}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-300 active:scale-90 cursor-pointer ${
                settings.isRagEnabled
                  ? 'bg-brand-500/10 border border-brand-500/25 text-brand-400 hover:bg-brand-500/20'
                  : 'border border-white/[0.03] bg-white/[0.015] hover:bg-white/[0.05] text-slate-400 hover:text-slate-200'
              }`}
            >
              <Search className="h-3.5 w-3.5" />
            </button>

            {/* Web Search (SearXNG) Toggle */}
            <button
              type="button"
              onClick={toggleWebSearch}
              title={settings.isWebSearchEnabled ? "Disable Web Search (SearXNG)" : "Enable Web Search (SearXNG)"}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-300 active:scale-90 cursor-pointer ${
                settings.isWebSearchEnabled
                  ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20'
                  : 'border border-white/[0.03] bg-white/[0.015] hover:bg-white/[0.05] text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
            </button>

            {/* Thinking Level Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setThinkingDropdownOpen(!thinkingDropdownOpen)}
                title={`Thinking Depth: ${settings.thinkingLevel || 'off'}`}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all duration-300 active:scale-90 cursor-pointer ${
                  settings.thinkingLevel && settings.thinkingLevel !== 'off'
                    ? 'bg-purple-500/10 border-purple-500/25 text-purple-400 hover:bg-purple-500/20'
                    : 'border-white/[0.03] bg-white/[0.015] hover:bg-white/[0.05] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Brain className="h-3.5 w-3.5" />
              </button>

              {thinkingDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setThinkingDropdownOpen(false)} />
                  <div className="absolute left-0 bottom-8.5 z-30 w-36 rounded-lg border border-white/[0.04] bg-slate-900/95 p-1 shadow-2xl backdrop-blur-xl animate-fade-in">
                    {([
                      { id: 'off', label: 'Thinking Off' },
                      { id: 'low', label: 'Low Depth' },
                      { id: 'medium', label: 'Medium Depth' },
                      { id: 'high', label: 'High Depth' }
                    ] as const).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectThinking(opt.id)}
                        className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[10.5px] transition cursor-pointer ${
                          (settings.thinkingLevel || 'off') === opt.id
                            ? 'bg-purple-500/10 text-white font-semibold'
                            : 'text-slate-400 hover:bg-white/[0.02] hover:text-slate-200'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {(settings.thinkingLevel || 'off') === opt.id && <Check className="h-3.5 w-3.5 text-purple-400" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Separator line */}
            <div className="w-[1px] h-4 bg-white/[0.06] mx-0.5" />

            {/* File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
              id="composer-file-upload"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach files (text/images)"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.03] bg-white/[0.015] hover:bg-white/[0.05] hover:text-slate-200 text-slate-400 transition-all duration-300 active:scale-90 cursor-pointer"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>

            {/* Voice Typing Mic */}
            <button
              type="button"
              onClick={toggleRecording}
              disabled={!isSpeechSupported || isTranscribing}
              title={
                !isSpeechSupported 
                  ? "Speech recognition is not supported in this browser" 
                  : isTranscribing
                    ? "Transcribing audio..."
                    : isRecording 
                      ? "Stop voice typing" 
                      : "Voice typing"
              }
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-300 active:scale-90 ${
                !isSpeechSupported
                  ? 'opacity-30 cursor-not-allowed border border-white/[0.02] text-slate-600 bg-transparent'
                  : isTranscribing
                    ? 'bg-brand-500/10 border border-brand-500/20 text-brand-400 animate-pulse cursor-wait'
                    : isRecording
                      ? engine === 'local'
                        ? 'bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/40 animate-pulse cursor-pointer'
                        : 'bg-red-500/25 border border-red-500/30 text-red-400 hover:bg-red-500/40 animate-pulse cursor-pointer'
                      : 'border border-white/[0.03] bg-white/[0.015] hover:bg-white/[0.05] text-slate-400 hover:text-slate-200 cursor-pointer'
              }`}
            >
              {isTranscribing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isRecording ? (
                <MicOff className="h-3.5 w-3.5" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={(!input.trim() && attachments.length === 0) || isGenerating}
              aria-label="Send message"
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-300 active:scale-90 ${
                (input.trim() || attachments.length > 0) && !isGenerating
                  ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-md cursor-pointer'
                  : 'bg-white/[0.01] text-slate-700'
              }`}
            >
              <ArrowUp className="h-3.5 w-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>

      {/* Micro-telemetry display */}
      {(isRecording || isTranscribing) && (
        <div className="mt-1.5 flex items-center px-2 text-[9px] font-medium tracking-wide select-none animate-fade-in min-h-[14px]">
          {isRecording && (
            <span className={`flex items-center gap-1 font-bold ${engine === 'local' ? 'text-emerald-500' : 'text-red-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full animate-ping ${engine === 'local' ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span>{engine === 'local' ? 'recording offline' : 'listening...'}</span>
            </span>
          )}
          {isTranscribing && (
            <span className="flex items-center gap-1 text-brand-400 font-bold animate-pulse">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              <span>
                {whisperStatus === 'loading' 
                  ? `downloading whisper model (${whisperProgress.toFixed(0)}%)` 
                  : 'transcribing whisper audio...'}
              </span>
            </span>
          )}
        </div>
      )}

    </div>
  );
};
