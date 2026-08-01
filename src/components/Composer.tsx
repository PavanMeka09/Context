import React, { useRef, useEffect, useState } from 'react';
import { Square, ArrowUp, Paperclip, Mic, MicOff, X, FileText, Search, ChevronDown, Check, Globe, Sparkles, Brain, Compass } from 'lucide-react';
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

  const [promptDropdownOpen, setPromptDropdownOpen] = useState(false);
  const [thinkingDropdownOpen, setThinkingDropdownOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);

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
            className="flex items-center gap-1.5 rounded-full border border-border bg-background hover:bg-accent px-3.5 py-1 text-[10px] font-medium text-foreground shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Square className="h-2.5 w-2.5 fill-current text-destructive" />
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
                  settings.isRagEnabled || settings.isWebSearchEnabled || settings.isBrowserAgentEnabled
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
                  <div role="menu" className="absolute left-0 bottom-8.5 z-30 w-44 rounded-md border border-border bg-popover p-1 shadow-md animate-fade-in">
                    <div className="px-2 py-1 text-[9px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border mb-1">
                      Context Tools
                    </div>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => { toggleSearch(); setToolsDropdownOpen(false); }}
                      className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[10.5px] transition cursor-pointer ${
                        settings.isRagEnabled ? 'bg-accent text-accent-foreground font-semibold' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span className="flex-1">Docs (RAG)</span>
                      {settings.isRagEnabled && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
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

            {/* Docs (RAG) Toggle — md+ */}
            <button
              type="button"
              onClick={toggleSearch}
              title={settings.isRagEnabled ? "Disable Local Docs context (RAG)" : "Enable Local Docs context (RAG)"}
              aria-label="Toggle Docs RAG"
              aria-pressed={settings.isRagEnabled}
              className={`hidden md:flex h-7 items-center gap-1.5 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                settings.isRagEnabled
                  ? 'px-2 border border-primary bg-primary text-primary-foreground hover:bg-primary/95'
                  : 'w-7 justify-center border border-input bg-transparent hover:bg-accent hover:text-accent-foreground text-muted-foreground'
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              {settings.isRagEnabled && <span className="text-[10px] font-semibold">Docs</span>}
            </button>

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
            {input.trim() && (
              <span className="text-[10px] font-medium text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border border-border select-none animate-fade-in">
                ~{Math.ceil(input.trim().length / 4)} tokens
              </span>
            )}
            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={(!input.trim() && attachments.length === 0) || isGenerating}
              aria-label="Send message"
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                (input.trim() || attachments.length > 0) && !isGenerating
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm cursor-pointer'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <ArrowUp className="h-3.5 w-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>

      {/* Micro-telemetry display */}
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
