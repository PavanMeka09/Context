import React, { useRef, useEffect, useState } from 'react';
import { Square, ArrowUp, Paperclip, Mic, MicOff, X, FileText, Search, ChevronDown, Check, Globe, Sparkles, Brain, Compass, Clock } from 'lucide-react';
import type { Attachment, Settings, SystemPrompt } from '../utils/storage';
import { Storage, PRESET_PROMPTS } from '../utils/storage';

interface ComposerProps {
  input: string;
  onChangeInput: (text: string) => void;
  onSend: (attachments?: Attachment[]) => void;
  isGenerating: boolean;
  onStop: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  userPrompts?: string[];

  onError?: (message: React.ReactNode) => void;
  settings: Settings;
  onSettingsChanged?: (settings: Settings) => void;
  activePromptId: string;
  onSelectPromptId: (id: string) => void;
  customPrompts: SystemPrompt[];
  queueCount?: number;
  messageQueue?: { id: string; userGoal: string }[];
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
  customPrompts,
  queueCount = 0,
  messageQueue
}) => {
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [tempInput, setTempInput] = useState('');

  // Speech-to-Text and File Upload States
  const [isRecording, setIsRecording] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [promptDropdownOpen, setPromptDropdownOpen] = useState(false);
  const [thinkingDropdownOpen, setThinkingDropdownOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);

  const getActivePromptName = () => {
    const all = [...PRESET_PROMPTS, ...customPrompts];
    const prompt = all.find(p => p.id === activePromptId);
    return prompt ? prompt.name : 'General Assistant';
  };


  const toggleWebSearch = () => {
    const nextWebSearch = !settings.isWebSearchEnabled;
    const updatedSettings = { ...settings, isWebSearchEnabled: nextWebSearch };
    Storage.saveSettings(updatedSettings);
    onSettingsChanged?.(updatedSettings);
  };

  const toggleWebContext = () => {
    const nextWebContext = !settings.isWebContextEnabled;
    const updatedSettings = { ...settings, isWebContextEnabled: nextWebContext };
    Storage.saveSettings(updatedSettings);
    onSettingsChanged?.(updatedSettings);
  };

  const toggleBrowserAgent = () => {
    const nextBrowserAgent = !settings.isBrowserAgentEnabled;
    const updatedSettings = { ...settings, isBrowserAgentEnabled: nextBrowserAgent };
    Storage.saveSettings(updatedSettings);
    onSettingsChanged?.(updatedSettings);
  };

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
          errorDetail = 'A network error occurred. Native speech recognition requires an internet connection.';
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

  const isSpeechSupported = typeof window !== 'undefined' && 
                            ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const toggleRecording = async () => {
    if (!recognitionRef.current) {
      onError?.('Speech Recognition is not supported or permitted in this browser.');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      setIsRecording(true);
      recognitionRef.current.start();
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
    if (input.trim() || attachments.length > 0) {
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
            className="flex items-center gap-1.5 rounded-full border border-border bg-background hover:bg-accent px-3.5 py-1 text-[10px] font-medium text-foreground shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Square className="h-2.5 w-2.5 fill-current text-destructive" />
            <span>Stop generating</span>
          </button>
        </div>
      )}

      {/* Queue Box at top of message box */}
      {messageQueue && messageQueue.length > 0 && (
        <div className="mb-2.5 flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 shadow-sm animate-fade-in backdrop-blur-sm select-none">
          <div className="flex items-center justify-between font-semibold">
            <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
              <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Queued Messages ({messageQueue.length})</span>
            </div>
            <span className="text-[10px] font-medium text-amber-600/80 dark:text-amber-400/80">Will process automatically</span>
          </div>
          <div className="flex flex-col gap-1.5 max-h-28 overflow-y-auto pr-1">
            {messageQueue.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg bg-background/80 border border-amber-500/20 px-2.5 py-1.5 text-foreground shadow-2xs">
                <span className="font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded shrink-0">#{idx + 1}</span>
                <span className="truncate flex-1 font-medium text-xs text-foreground/90">{item.userGoal}</span>
              </div>
            ))}
          </div>
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
                className="group relative flex items-center gap-1.5 rounded-md border border-border bg-muted/50 p-1.5 text-[10px] text-foreground"
              >
                {isImage ? (
                  <img
                    src={att.data}
                    alt={att.name}
                    className="h-7 w-7 rounded object-cover border border-border"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-secondary text-secondary-foreground border border-border">
                    <FileText className="h-4 w-4" />
                  </div>
                )}
                
                <div className="flex flex-col min-w-0 pr-5">
                  <span className="truncate max-w-[120px] font-semibold text-foreground leading-tight">{att.name}</span>
                  <span className="text-[8px] text-muted-foreground mt-0.5">{(att.size / 1024).toFixed(1)} KB</span>
                </div>

                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-background hover:bg-destructive text-muted-foreground hover:text-destructive-foreground border border-border transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                  aria-label="Remove attachment"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Active Voice Recording Status Banner */}
      {isRecording && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500 animate-pulse select-none">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <Mic className="h-4 w-4 text-red-500" />
            <span>Listening... Speak clearly into your mic</span>
          </div>
          <button
            type="button"
            onClick={toggleRecording}
            className="rounded px-2 py-0.5 text-[10px] uppercase font-bold bg-red-500 text-white hover:bg-red-600 transition cursor-pointer"
          >
            Done
          </button>
        </div>
      )}

      {/* Input container */}
      <div className="relative rounded-lg border border-input bg-card p-1.5 transition-all flex flex-col gap-1.5 focus-within:ring-1 focus-within:ring-ring">
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
              ? "Listening... Speak clearly now." 
              : "Ask anything..."
          }
          rows={1}
          style={{ resize: 'none' }}
          className="w-full bg-transparent px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none scrollbar-none leading-relaxed"
        />

        {/* Composer Bottom Toolbar */}
        <div className="border-t border-border pt-2 px-1.5 pb-0.5 flex items-center justify-between select-none">
          <div className="flex items-center gap-1.5">
            {/* System Prompt Picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPromptDropdownOpen(!promptDropdownOpen)}
                title={`Active Persona: ${getActivePromptName()}`}
                aria-label="Select persona"
                aria-expanded={promptDropdownOpen}
                aria-haspopup="menu"
                className={`flex h-7 px-2.5 items-center gap-1.5 rounded-md text-[10px] font-semibold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  activePromptId !== 'preset-general'
                    ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/95'
                    : 'border-input bg-transparent hover:bg-accent hover:text-accent-foreground text-muted-foreground'
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
                  <div className="absolute left-0 bottom-8.5 z-30 w-48 rounded-md border border-border bg-popover p-1 shadow-md animate-fade-in max-h-52 overflow-y-auto">
                    <div className="px-2 py-1 text-[9px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border mb-1">
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
                            ? 'bg-accent text-accent-foreground font-semibold'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                      >
                        <span className="truncate pr-2">{prompt.name}</span>
                        {activePromptId === prompt.id && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    ))}
                    {customPrompts.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[9px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border mt-2 mb-1">
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
                                ? 'bg-accent text-accent-foreground font-semibold'
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            }`}
                          >
                            <span className="truncate pr-2">{prompt.name}</span>
                            {activePromptId === prompt.id && <Check className="h-3.5 w-3.5 text-primary" />}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Separator line */}
            <div className="w-[1px] h-4 bg-border mx-0.5" />

            {/* Tools: collapsed menu on small screens, inline on md+ */}
            <div className="relative md:hidden">
              <button
                type="button"
                onClick={() => setToolsDropdownOpen(!toolsDropdownOpen)}
                title="Tools"
                aria-label="Tools"
                aria-expanded={toolsDropdownOpen}
                aria-haspopup="menu"
                className={`flex h-7 px-2.5 items-center gap-1.5 rounded-md text-[10px] font-semibold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  settings.isWebSearchEnabled || settings.isBrowserAgentEnabled || settings.isWebContextEnabled
                    ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/95'
                    : 'border-input bg-transparent hover:bg-accent hover:text-accent-foreground text-muted-foreground'
                }`}
              >
                <Search className="h-3.5 w-3.5" />
                <span>Tools</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
              {toolsDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setToolsDropdownOpen(false)} />
                  <div role="menu" className="absolute left-0 bottom-8.5 z-30 w-48 rounded-md border border-border bg-popover p-1 shadow-md animate-fade-in">
                    <div className="px-2 py-1 text-[9px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border mb-1">
                      Context Tools
                    </div>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => { toggleWebSearch(); setToolsDropdownOpen(false); }}
                      className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[10.5px] transition cursor-pointer ${
                        settings.isWebSearchEnabled ? 'bg-accent text-accent-foreground font-semibold' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span className="flex-1">Web Search</span>
                      {settings.isWebSearchEnabled && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => { toggleWebContext(); setToolsDropdownOpen(false); }}
                      className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[10.5px] transition cursor-pointer ${
                        settings.isWebContextEnabled ? 'bg-accent text-accent-foreground font-semibold' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span className="flex-1">Web Context</span>
                      {settings.isWebContextEnabled && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => { toggleBrowserAgent(); setToolsDropdownOpen(false); }}
                      className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[10.5px] transition cursor-pointer ${
                        settings.isBrowserAgentEnabled ? 'bg-accent text-accent-foreground font-semibold' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      <Compass className="h-3.5 w-3.5" />
                      <span className="flex-1">Browser</span>
                      {settings.isBrowserAgentEnabled && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  </div>
                </>
              )}
            </div>


            {/* Web Search Toggle — md+ */}
            <button
              type="button"
              onClick={toggleWebSearch}
              title={settings.isWebSearchEnabled ? "Disable Web Search (SearXNG)" : "Enable Web Search (SearXNG)"}
              aria-label="Toggle Web Search"
              aria-pressed={settings.isWebSearchEnabled}
              className={`hidden md:flex h-7 items-center gap-1.5 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                settings.isWebSearchEnabled
                  ? 'px-2 border border-primary bg-primary text-primary-foreground hover:bg-primary/95'
                  : 'w-7 justify-center border border-input bg-transparent hover:bg-accent hover:text-accent-foreground text-muted-foreground'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              {settings.isWebSearchEnabled && <span className="text-[10px] font-semibold">Web</span>}
            </button>

            {/* Web Context Toggle — md+ */}
            <button
              type="button"
              onClick={toggleWebContext}
              title={settings.isWebContextEnabled ? "Disable Web Context (AI auto-crawls links & page content)" : "Enable Web Context (AI auto-crawls links & page content)"}
              aria-label="Toggle Web Context"
              aria-pressed={settings.isWebContextEnabled}
              className={`hidden md:flex h-7 items-center gap-1.5 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                settings.isWebContextEnabled
                  ? 'px-2 border border-primary bg-primary text-primary-foreground hover:bg-primary/95'
                  : 'w-7 justify-center border border-input bg-transparent hover:bg-accent hover:text-accent-foreground text-muted-foreground'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              {settings.isWebContextEnabled && <span className="text-[10px] font-semibold">Context</span>}
            </button>

            {/* Browser Agent Toggle — md+ */}
            <button
              type="button"
              onClick={toggleBrowserAgent}
              title={settings.isBrowserAgentEnabled ? "Disable Browser Agent" : "Enable Browser Agent (Automate browser tasks)"}
              aria-label="Toggle Browser Agent"
              aria-pressed={settings.isBrowserAgentEnabled}
              className={`hidden md:flex h-7 items-center gap-1.5 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                settings.isBrowserAgentEnabled
                  ? 'px-2 border border-primary bg-primary text-primary-foreground hover:bg-primary/95'
                  : 'w-7 justify-center border border-input bg-transparent hover:bg-accent hover:text-accent-foreground text-muted-foreground'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              {settings.isBrowserAgentEnabled && <span className="text-[10px] font-semibold">Browser</span>}
            </button>

            {/* Separator line */}
            <div className="w-[1px] h-4 bg-border mx-0.5" />

            {/* Thinking Level Picker */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setThinkingDropdownOpen(!thinkingDropdownOpen)}
                title={`Thinking Level: ${settings.thinkingLevel || 'off'}`}
                aria-label="Thinking level"
                aria-expanded={thinkingDropdownOpen}
                aria-haspopup="menu"
                className={`flex h-7 px-2.5 items-center gap-1.5 rounded-md text-[10px] font-semibold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  settings.thinkingLevel && settings.thinkingLevel !== 'off'
                    ? 'border border-primary bg-primary text-primary-foreground hover:bg-primary/95'
                    : 'border-input bg-transparent hover:bg-accent hover:text-accent-foreground text-muted-foreground'
                }`}
              >
                <Brain className="h-3.5 w-3.5" />
                <span className="truncate max-w-[50px] capitalize">
                  {settings.thinkingLevel && settings.thinkingLevel !== 'off' ? settings.thinkingLevel : 'Off'}
                </span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>

              {thinkingDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setThinkingDropdownOpen(false)} />
                  <div role="menu" className="absolute left-0 bottom-8.5 z-30 w-36 rounded-md border border-border bg-popover p-1 shadow-md animate-fade-in">
                    <div className="px-2 py-1 text-[9px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border mb-1">
                      Thinking Level
                    </div>
                    {(['off', 'low', 'medium', 'high'] as const).map((level) => (
                      <button
                        key={level}
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          const updatedSettings = { ...settings, thinkingLevel: level };
                          Storage.saveSettings(updatedSettings);
                          onSettingsChanged?.(updatedSettings);
                          setThinkingDropdownOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[10.5px] transition cursor-pointer capitalize ${
                          (settings.thinkingLevel || 'off') === level
                            ? 'bg-accent text-accent-foreground font-semibold'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                      >
                        <span>{level}</span>
                        {(settings.thinkingLevel || 'off') === level && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Separator line */}
            <div className="w-[1px] h-4 bg-border mx-0.5" />

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
              aria-label="Attach files"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-input bg-transparent hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>

            {/* Voice Typing Mic */}
            <button
              type="button"
              onClick={toggleRecording}
              disabled={!isSpeechSupported}
              aria-label={isRecording ? "Stop voice typing" : "Voice typing"}
              aria-pressed={isRecording}
              title={
                !isSpeechSupported 
                  ? "Speech recognition is not supported in this browser" 
                  : isRecording 
                    ? "Stop voice typing" 
                    : "Voice typing"
              }
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                !isSpeechSupported
                  ? 'opacity-35 cursor-not-allowed border border-input text-muted-foreground bg-transparent'
                  : isRecording
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse cursor-pointer'
                    : 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground text-muted-foreground cursor-pointer'
              }`}
            >
              {isRecording ? (
                <MicOff className="h-3.5 w-3.5" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {queueCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded select-none animate-fade-in">
                <Clock className="h-3 w-3" />
                <span>Queued ({queueCount})</span>
              </span>
            )}
            {input.trim() && (
              <span className="text-[10px] font-medium text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border border-border select-none animate-fade-in">
                ~{Math.ceil(input.trim().length / 4)} tokens
              </span>
            )}
            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!input.trim() && attachments.length === 0}
              aria-label="Send message"
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                input.trim() || attachments.length > 0
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm cursor-pointer'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <ArrowUp className="h-3.5 w-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>

      {/* Audio recording status indicator */}
      {isRecording && (
        <div className="mt-1.5 flex items-center px-2 text-[9px] font-bold tracking-wide select-none animate-fade-in min-h-[14px]">
          <span className="flex items-center gap-1 text-destructive">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-ping" />
            <span>listening...</span>
          </span>
        </div>
      )}

    </div>
  );
};
