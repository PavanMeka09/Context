/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from 'react';
import { PRESET_PROMPTS, Storage } from '../utils/storage';
import type { Settings, SystemPrompt, Chat } from '../utils/storage';
import { fetchModels } from '../utils/api';
import { localSpeech } from '../utils/localSpeech';
import type { ModelOption } from '../utils/api';
import { X, Eye, EyeOff, Save, Plus, Trash2, Edit2, AlertCircle, Loader2, Download, CheckSquare, ChevronDown, Check, Globe, Search, Cpu, Sliders, Database, FileText, Terminal } from 'lucide-react';
import { testSearxngConnection } from '../utils/searxng';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeChat: Chat | null;
  onSettingsSaved: (settings: Settings) => void;
  onPromptsChanged: () => void;
  onBackupImported: () => void;
  fontSize: 'sm' | 'base' | 'lg';
  onFontSizeChanged: (size: 'sm' | 'base' | 'lg') => void;
  theme: 'dark' | 'light' | 'system';
  onThemeChanged: (theme: 'dark' | 'light' | 'system') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  activeChat,
  onSettingsSaved,
  onPromptsChanged,
  onBackupImported,
  fontSize,
  onFontSizeChanged,
  theme,
  onThemeChanged
}) => {
  const [activeTab, setActiveTab] = useState<'provider' | 'prompts' | 'websearch' | 'preferences' | 'backup'>('provider');
  const [settings, setSettings] = useState<Settings>(() => Storage.getSettings());
  const [localSttStatus, setLocalSttStatus] = useState<string>('idle');

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const triggerDownload = (content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToMarkdown = () => {
    if (!activeChat) return;
    let mdContent = `# ${activeChat.title}\n\n`;
    mdContent += `*Created: ${new Date(activeChat.createdAt).toLocaleString()}*\n`;
    mdContent += `*Last Updated: ${new Date(activeChat.updatedAt).toLocaleString()}*\n\n`;
    mdContent += `---\n\n`;

    activeChat.messages.forEach(msg => {
      const roleLabel = msg.role === 'user' ? '### 👤 User' : '### 🤖 Assistant';
      mdContent += `${roleLabel}\n\n${msg.content}\n\n---\n\n`;
    });

    triggerDownload(mdContent, `${slugify(activeChat.title)}.md`, 'text/markdown');
  };

  const exportToJSON = () => {
    if (!activeChat) return;
    const jsonString = JSON.stringify(activeChat, null, 2);
    triggerDownload(jsonString, `${slugify(activeChat.title)}.json`, 'application/json');
  };

  const exportToPDF = () => {
    if (!activeChat) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }

    let messagesHtml = '';
    const cards = document.querySelectorAll('.message-card-body');
    
    activeChat.messages.forEach((msg, idx) => {
      const isUser = msg.role === 'user';
      const roleText = isUser ? 'User' : 'Assistant';
      
      let cardContent: string;
      if (cards && cards[idx]) {
        const clone = cards[idx].cloneNode(true) as HTMLElement;
        const toRemove = clone.querySelectorAll('.hover-actions, button, textarea, .branching-pagination');
        toRemove.forEach(el => el.remove());
        cardContent = clone.innerHTML;
      } else {
        cardContent = `<p>${msg.content.replace(/\n/g, '<br />')}</p>`;
      }

      messagesHtml += `
        <div class="message-row">
          <div class="message-meta">${roleText} • ${new Date(msg.timestamp).toLocaleString()}</div>
          <div class="message-content ${isUser ? 'user-content' : 'assistant-content'}">
            ${cardContent}
          </div>
        </div>
      `;
    });

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${activeChat.title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@600;700&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background: white;
            color: #1e293b;
            margin: 0;
            padding: 40px;
            line-height: 1.6;
          }
          .header {
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .title {
            font-family: 'Outfit', sans-serif;
            font-size: 26px;
            font-weight: 700;
            color: #0f172a;
            margin: 0;
          }
          .meta {
            font-size: 11px;
            color: #64748b;
            margin-top: 8px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .message-row {
            margin-bottom: 30px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .message-meta {
            font-size: 10px;
            font-weight: 600;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 6px;
          }
          .message-content {
            font-size: 14px;
            color: #334155;
          }
          .user-content {
            background: #f8fafc;
            border-left: 3px solid #4f46e5;
            padding: 12px 16px;
            border-radius: 0 8px 8px 0;
          }
          .assistant-content {
            padding: 4px 0;
          }
          pre {
            background: #0f172a !important;
            color: #cbd5e1 !important;
            padding: 12px 16px;
            border-radius: 8px;
            font-family: Menlo, Monaco, Consolas, monospace;
            font-size: 12px;
            overflow-x: auto;
            margin: 16px 0;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          code {
            font-family: Menlo, Monaco, Consolas, monospace;
            font-size: 12.5px;
            background: #f1f5f9;
            color: #e11d48;
            padding: 2px 4px;
            border-radius: 4px;
          }
          pre code {
            background: transparent;
            color: inherit;
            padding: 0;
            border-radius: 0;
          }
          .text-slate-500 { color: #64748b !important; font-style: italic; }
          .text-emerald-400 { color: #059669 !important; font-weight: 500; }
          .text-brand-500 { color: #4f46e5 !important; font-weight: bold; }
          .text-sky-400 { color: #0284c7 !important; font-weight: 600; }
          .text-blue-400 { color: #2563eb !important; }
          .text-amber-400 { color: #d97706 !important; }
          .text-slate-200 { color: #cbd5e1 !important; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
            font-size: 13px;
          }
          th, td {
            padding: 8px 12px;
            border: 1px solid #e2e8f0;
            text-align: left;
          }
          th {
            background: #f8fafc;
            color: #0f172a;
            font-weight: 600;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">${activeChat.title}</h1>
          <div class="meta">Transcript exported from Context AI • ${activeChat.messages.length} turns</div>
        </div>
        ${messagesHtml}
      </body>
      </html>
    `;

    doc.open();
    doc.write(printHtml);
    doc.close();

    setTimeout(() => {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }
    }, 500);
  };
  const [localSttProgress, setLocalSttProgress] = useState<number>(0);

  // SearXNG connection tester states
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const result = await testSearxngConnection(settings.searxngUrl);
      setTestingConnection(false);
      if (result.success) {
        setConnectionTestResult({
          success: true,
          message: `Successfully connected! SearXNG search engines are active.`
        });
      } else {
        setConnectionTestResult({
          success: false,
          message: `Connection failed: ${result.error || 'Check the URL and try again.'}`
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Check the URL and try again.';
      setTestingConnection(false);
      setConnectionTestResult({
        success: false,
        message: `Connection failed: ${errorMsg}`
      });
    }
  };

  useEffect(() => {
    const unsubStatus = localSpeech.subscribeStatus((status) => {
      setTimeout(() => setLocalSttStatus(status), 0);
    });
    const unsubProgress = localSpeech.subscribeProgress((progress) => {
      setTimeout(() => setLocalSttProgress(progress), 0);
    });
    return () => {
      unsubStatus();
      unsubProgress();
    };
  }, []);

  const handleSpeechEngineChange = (engine: 'native' | 'local') => {
    setSettings(prev => ({ ...prev, speechToTextEngine: engine }));
  };
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  // Custom Dropdowns open states
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  // System Prompts state
  const [customPrompts, setCustomPrompts] = useState<SystemPrompt[]>(() => Storage.getCustomPrompts());
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [promptName, setPromptName] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);

  // Backup & Import states
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const handleExportBackup = () => {
    const backupData = {
      version: '1.0.0',
      chats: Storage.getChats(),
      customPrompts: Storage.getCustomPrompts(),
      settings: Storage.getSettings()
    };
    
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `context-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportSuccess(false);
    
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        if (!data || (typeof data !== 'object')) {
          throw new Error('Invalid JSON format.');
        }

        const chats = Array.isArray(data.chats) ? data.chats : [];
        const customPrompts = Array.isArray(data.customPrompts) ? data.customPrompts : [];
        const loadedSettings = data.settings && typeof data.settings === 'object' ? data.settings : null;

        if (chats.length > 0) {
          Storage.saveChatsImmediately(chats);
        }
        if (customPrompts.length > 0) {
          Storage.saveCustomPrompts(customPrompts);
        }
        if (loadedSettings) {
          Storage.saveSettings(loadedSettings);
        }

        setImportSuccess(true);
        onBackupImported();
        onPromptsChanged();
        
        setTimeout(() => setImportSuccess(false), 3000);
      } catch (err) {
        console.error('Failed to parse backup JSON', err);
        setImportError('Failed to import backup. Please make sure it is a valid Context backup JSON file.');
      }
    };
    reader.readAsText(file);
  };

  const loadModelsForProvider = useCallback(async (provider: 'gemini' | 'openrouter' | 'ollama', key: string, activeModelId?: string, localUrl?: string) => {
    setLoadingModels(true);
    setModelError(null);
    setModelSearchQuery('');
    try {
      const fetched = await fetchModels(provider, key, localUrl);
      setModels(fetched);
      
      if (fetched.length > 0) {
        const modelExists = fetched.some(m => m.id === activeModelId);
        if (!modelExists) {
          setSettings(prev => ({ ...prev, model: fetched[0].id }));
        }
      } else {
        setSettings(prev => ({ ...prev, model: '' }));
      }
    } catch {
      setModelError('Failed to load dynamic models for this provider.');
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    setTimeout(() => {
      loadModelsForProvider(settings.provider, settings.apiKey, settings.model, settings.localUrl);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadModelsForProvider]);

  // Capture Escape key to close open dropdowns without dismissing settings modal
  useEffect(() => {
    const handleEscapeCapture = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (providerDropdownOpen) {
          e.preventDefault();
          e.stopPropagation();
          setProviderDropdownOpen(false);
        } else if (modelDropdownOpen) {
          e.preventDefault();
          e.stopPropagation();
          setModelDropdownOpen(false);
          setModelSearchQuery('');
        }
      }
    };

    if (providerDropdownOpen || modelDropdownOpen) {
      window.addEventListener('keydown', handleEscapeCapture, true); // true = capture phase
      return () => window.removeEventListener('keydown', handleEscapeCapture, true);
    }
  }, [providerDropdownOpen, modelDropdownOpen]);

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const apiKey = e.target.value;
    setSettings(prev => ({ ...prev, apiKey }));
  };

  const handleKeyBlur = () => {
    loadModelsForProvider(settings.provider, settings.apiKey, settings.model, settings.localUrl);
  };

  const handleSaveSettings = () => {
    Storage.saveSettings(settings);
    onSettingsSaved(settings);
    onClose();
  };

  const handleSavePrompt = (e: React.FormEvent) => {
    e.preventDefault();
    setPromptError(null);

    if (!promptName.trim() || !promptContent.trim()) {
      setPromptError('Both name and content are required.');
      return;
    }

    let updatedList: SystemPrompt[];
    if (editingPromptId) {
      updatedList = customPrompts.map(p =>
        p.id === editingPromptId
          ? { ...p, name: promptName.trim(), content: promptContent.trim() }
          : p
      );
      setEditingPromptId(null);
    } else {
      const newPrompt: SystemPrompt = {
        id: `custom-${Date.now()}`,
        name: promptName.trim(),
        content: promptContent.trim(),
        isCustom: true
      };
      updatedList = [...customPrompts, newPrompt];
    }

    Storage.saveCustomPrompts(updatedList);
    setCustomPrompts(updatedList);
    setPromptName('');
    setPromptContent('');
    onPromptsChanged();
  };

  const handleEditPrompt = (prompt: SystemPrompt) => {
    setEditingPromptId(prompt.id);
    setPromptName(prompt.name);
    setPromptContent(prompt.content);
  };

  const handleDeletePrompt = (id: string) => {
    const updatedList = customPrompts.filter(p => p.id !== id);
    Storage.saveCustomPrompts(updatedList);
    setCustomPrompts(updatedList);
    
    if (Storage.getActivePromptId() === id) {
      Storage.saveActivePromptId('preset-general');
    }
    
    onPromptsChanged();
  };

  const handleCancelPromptEdit = () => {
    setEditingPromptId(null);
    setPromptName('');
    setPromptContent('');
    setPromptError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-md animate-fade-in">
      <div className="glass-panel flex h-[520px] w-full max-w-xl flex-col overflow-hidden rounded-2xl shadow-2xl">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/[0.015] px-5 py-3.5 bg-slate-950/10">
          <h2 className="font-display text-sm font-semibold tracking-wide text-white">Settings</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-white/[0.01] bg-slate-950/5 px-5 overflow-x-auto scrollbar-none">
          {[
            { id: 'provider', name: 'AI Provider', icon: <Cpu className="h-3.5 w-3.5" /> },
            { id: 'prompts', name: 'System Prompts', icon: <FileText className="h-3.5 w-3.5" /> },
            { id: 'websearch', name: 'Web Search', icon: <Globe className="h-3.5 w-3.5" /> },
            { id: 'preferences', name: 'Preferences', icon: <Sliders className="h-3.5 w-3.5" /> },
            { id: 'backup', name: 'Backup & History', icon: <Database className="h-3.5 w-3.5" /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`border-b-2 px-3 py-2.5 text-xs font-medium transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'border-brand-500 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.icon}
              <span>{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'provider' ? (
            <div className="space-y-4">
              
              {/* Provider Selection */}
              <div className="relative">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  API Provider
                </label>
                 <button
                  type="button"
                  id="provider-select-btn"
                  aria-haspopup="listbox"
                  aria-expanded={providerDropdownOpen}
                  onClick={() => {
                    setProviderDropdownOpen(!providerDropdownOpen);
                    setModelDropdownOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-white/[0.04] bg-slate-900 px-3.5 py-2 text-left text-xs text-white cursor-pointer hover:bg-slate-850/80 transition-all duration-300"
                >
                  <span>
                    {settings.provider === 'gemini' && 'Google Gemini'}
                    {settings.provider === 'openrouter' && 'OpenRouter'}
                    {settings.provider === 'ollama' && 'Ollama (Local LLM)'}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>

                {providerDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setProviderDropdownOpen(false)} />
                    <div 
                      role="listbox" 
                      aria-labelledby="provider-select-btn"
                      className="absolute left-0 right-0 mt-2 z-20 rounded-lg border border-white/[0.04] bg-slate-900 p-1 shadow-2xl backdrop-blur-xl animate-fade-in"
                    >
                      {[
                        { id: 'gemini', name: 'Google Gemini' },
                        { id: 'openrouter', name: 'OpenRouter' },
                        { id: 'ollama', name: 'Ollama (Local LLM)' }
                      ].map(p => (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          aria-selected={settings.provider === p.id}
                          onClick={() => {
                            const newSettings = { ...settings, provider: p.id as any };
                            if (p.id === 'ollama' && !newSettings.localUrl) {
                              newSettings.localUrl = 'http://localhost:11434/v1';
                            }
                            setSettings(newSettings);
                            loadModelsForProvider(p.id as any, newSettings.apiKey, '', newSettings.localUrl);
                            setProviderDropdownOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs transition cursor-pointer ${
                            settings.provider === p.id
                              ? 'bg-brand-500/10 text-white font-semibold'
                              : 'text-slate-400 hover:bg-white/[0.02] hover:text-slate-200'
                          }`}
                        >
                          <span>{p.name}</span>
                          {settings.provider === p.id && <Check className="h-3.5 w-3.5 text-brand-500" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* API Key */}
              {settings.provider !== 'ollama' && (
                <div className="space-y-1">
                  <label htmlFor="api-key-input" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      id="api-key-input"
                      type={showKey ? 'text' : 'password'}
                      value={settings.apiKey}
                      onChange={handleKeyChange}
                      onBlur={handleKeyBlur}
                      placeholder={
                        settings.provider === 'gemini' 
                          ? 'Enter Gemini API Key...' 
                          : 'sk-or-...'
                      }
                      className="glass-input w-full rounded-lg bg-slate-900 pl-3.5 pr-10 py-2 text-xs font-mono text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                      aria-label={showKey ? "Hide API key" : "Show API key"}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex justify-between items-center text-[9px] text-slate-400 mt-1 select-none">
                    <span>Saved locally. No backend tracking.</span>
                    {settings.provider === 'gemini' && (
                      <a
                        href="https://aistudio.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-500 hover:text-brand-400 font-semibold underline transition duration-150"
                      >
                        Get Free Gemini Key
                      </a>
                    )}
                    {settings.provider === 'openrouter' && (
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-500 hover:text-brand-400 font-semibold underline transition duration-150"
                      >
                        Get OpenRouter Key
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Local Server Endpoint for Ollama */}
              {settings.provider === 'ollama' && (
                <div className="space-y-1">
                  <label htmlFor="local-url-input" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Local Server Endpoint
                  </label>
                  <input
                    id="local-url-input"
                    type="text"
                    value={settings.localUrl || ''}
                    onChange={(e) => {
                      const localUrl = e.target.value;
                      setSettings(prev => ({ ...prev, localUrl }));
                    }}
                    onBlur={() => {
                      loadModelsForProvider(settings.provider, settings.apiKey, settings.model, settings.localUrl);
                    }}
                    placeholder="http://localhost:11434/v1"
                    className="glass-input w-full rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-mono text-white"
                  />
                  <div className="flex justify-between items-center text-[9px] text-slate-400 mt-1 select-none">
                    <span>Ollama default: http://localhost:11434/v1 | LM Studio: http://localhost:1234/v1</span>
                  </div>
                </div>
              )}

              {/* Model Dropdown */}
              <div className="relative">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Model Selection
                  </label>
                  {loadingModels && (
                    <span className="flex items-center gap-1 text-[10px] text-brand-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Fetching...
                    </span>
                  )}
                </div>
                
                {modelError && (
                  <div className="mb-2.5 flex items-center gap-2 rounded-lg bg-red-950/20 border border-red-900/30 p-2.5 text-[10px] text-red-400">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{modelError}</span>
                  </div>
                )}

                <button
                  type="button"
                  id="model-select-btn"
                  aria-haspopup="listbox"
                  aria-expanded={modelDropdownOpen}
                  onClick={() => {
                    if (models.length > 0 && !loadingModels) {
                      setModelDropdownOpen(!modelDropdownOpen);
                      setProviderDropdownOpen(false);
                    }
                  }}
                  disabled={loadingModels || models.length === 0}
                  className="flex w-full items-center justify-between rounded-lg border border-white/[0.04] bg-slate-900 px-3.5 py-2 text-left text-xs text-white cursor-pointer hover:bg-slate-850/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                >
                  <span>
                    {models.find(m => m.id === settings.model)?.name || 
                     'Configure API key above to load models...'}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>

                {modelDropdownOpen && models.length > 0 && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => {
                      setModelDropdownOpen(false);
                      setModelSearchQuery('');
                    }} />
                    <div 
                      role="listbox" 
                      aria-labelledby="model-select-btn"
                      className="absolute left-0 right-0 mt-2.5 z-20 flex flex-col max-h-60 rounded-lg border border-white/[0.04] bg-slate-900 shadow-2xl backdrop-blur-xl animate-fade-in"
                    >
                      {/* Search Bar */}
                      <div className="p-2 border-b border-white/[0.03] shrink-0 relative select-none">
                        <input
                          type="text"
                          value={modelSearchQuery}
                          onChange={(e) => setModelSearchQuery(e.target.value)}
                          placeholder="Search models..."
                          autoFocus
                          className="w-full bg-slate-950/40 border border-white/[0.04] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50 transition-all duration-300"
                        />
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                      </div>

                      {/* Models List */}
                      <div className="flex-1 overflow-y-auto p-1 max-h-40 scrollbar-thin">
                        {(() => {
                          const filtered = models.filter(m => 
                            m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || 
                            m.id.toLowerCase().includes(modelSearchQuery.toLowerCase())
                          );
                          
                          if (filtered.length === 0) {
                            return (
                              <div className="text-center py-4 text-xs text-slate-500 italic select-none">
                                No models found
                              </div>
                            );
                          }
                          
                          return filtered.map(m => (
                            <button
                              key={m.id}
                              type="button"
                              role="option"
                              aria-selected={settings.model === m.id}
                              onClick={() => {
                                setSettings(prev => ({ ...prev, model: m.id }));
                                setModelDropdownOpen(false);
                                setModelSearchQuery('');
                              }}
                              className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs transition cursor-pointer ${
                                settings.model === m.id
                                  ? 'bg-brand-500/10 text-white font-semibold'
                                  : 'text-slate-400 hover:bg-white/[0.02] hover:text-slate-200'
                              }`}
                            >
                              <span>{m.name}</span>
                              {settings.model === m.id && <Check className="h-3.5 w-3.5 text-brand-500" />}
                            </button>
                          ));
                        })()}
                      </div>
                    </div>
                  </>
                )}
              </div>

            </div>
          ) : activeTab === 'prompts' ? (
            <div className="space-y-5">
              
              {/* CRUD Custom Prompt Form */}
              <form onSubmit={handleSavePrompt} className="space-y-2 rounded-xl border border-white/[0.03] bg-white/[0.01] p-3">
                <h3 className="font-display text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {editingPromptId ? 'Edit Custom Prompt' : 'Create Custom Prompt'}
                </h3>
                
                {promptError && (
                  <div className="flex items-center gap-1.5 text-[10px] text-red-400">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{promptError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Prompt Name (e.g. Code Architect)"
                    value={promptName}
                    onChange={e => setPromptName(e.target.value)}
                    className="glass-input w-full rounded-lg bg-slate-950 px-3 py-1.5 text-xs text-white"
                  />
                  <textarea
                    placeholder="Instructions (e.g. Act as a software engineer and answer with typescript...)"
                    value={promptContent}
                    onChange={e => setPromptContent(e.target.value)}
                    rows={2}
                    className="glass-input w-full rounded-lg bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
                  />
                  
                  <div className="flex justify-end gap-1.5">
                    {editingPromptId && (
                      <button
                        type="button"
                        onClick={handleCancelPromptEdit}
                        className="rounded border border-white/[0.05] bg-white/[0.01] px-2.5 py-1 text-[10px] text-slate-400 hover:bg-white/5 hover:text-white"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      className="flex items-center gap-1 rounded bg-brand-600 hover:bg-brand-500 px-3 py-1 text-[10px] font-medium text-white shadow-sm"
                    >
                      <Plus className="h-3 w-3" />
                      <span>{editingPromptId ? 'Update' : 'Add'}</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* Prompts list */}
              <div className="space-y-4">
                {/* Presets List */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">System Presets (Read-Only)</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRESET_PROMPTS.map(p => (
                      <div key={p.id} className="rounded-lg bg-white/[0.01] border border-white/[0.03] p-2 text-left text-[11px] leading-tight select-none">
                        <span className="font-semibold text-slate-200 block mb-0.5">{p.name}</span>
                        <span className="text-slate-500 line-clamp-1 italic">{p.content}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom List */}
                <div className="space-y-1.5 pt-1 border-t border-white/[0.01]">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 block">Your Custom Prompts</span>
                  
                  {customPrompts.length === 0 ? (
                    <p className="text-[10px] italic text-slate-500 py-1">No custom prompts created yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {customPrompts.map(p => (
                        <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/[0.03] bg-white/[0.01] px-3 py-2">
                          <div className="flex-1 min-w-0 pr-4">
                            <span className="font-semibold text-white text-[11px] block">{p.name}</span>
                            <span className="text-slate-500 text-[10px] italic line-clamp-1 mt-[1px]">{p.content}</span>
                          </div>
                          
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleEditPrompt(p)}
                              className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-white"
                              aria-label={`Edit prompt ${p.name}`}
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePrompt(p.id)}
                              className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-red-400"
                              aria-label={`Delete prompt ${p.name}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

            </div>
          ) : activeTab === 'websearch' ? (
            <div className="space-y-4 animate-fade-in select-none">
              
              {/* Enable Web Search Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-white/[0.03] bg-white/[0.01] p-3.5">
                <div>
                  <h3 className="font-display text-xs font-semibold text-white">Enable Web Search</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    Give the AI assistant real-time web search capabilities using SearXNG.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings(prev => ({ ...prev, isWebSearchEnabled: !prev.isWebSearchEnabled }))}
                  aria-checked={settings.isWebSearchEnabled}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.isWebSearchEnabled ? 'bg-emerald-500' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.isWebSearchEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* SearXNG Instance URL */}
              <div className="space-y-1.5">
                <label htmlFor="searxng-url-input" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  SearXNG Instance URL
                </label>
                <div className="flex gap-2">
                  <input
                    id="searxng-url-input"
                    type="text"
                    value={settings.searxngUrl || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSettings(prev => ({ ...prev, searxngUrl: val }));
                    }}
                    placeholder="http://localhost:8080 (Leave blank for Docker proxy)"
                    className="glass-input flex-1 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-mono text-white"
                  />
                  <button
                    type="button"
                    disabled={testingConnection}
                    onClick={handleTestConnection}
                    className="flex h-8 items-center justify-center rounded-lg border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.06] text-[10px] font-semibold text-slate-300 hover:text-white px-3 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {testingConnection ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Testing...</span>
                      </span>
                    ) : (
                      'Test Connection'
                    )}
                  </button>
                </div>
                
                {connectionTestResult && (
                  <div className={`mt-2 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] animate-fade-in ${
                    connectionTestResult.success
                      ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400'
                      : 'bg-red-950/20 border-red-900/30 text-red-400'
                  }`}>
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{connectionTestResult.message}</span>
                  </div>
                )}
                
                <p className="text-[9px] text-slate-500 leading-relaxed mt-1 select-none">
                  SearXNG is a privacy-respecting search engine. If you are using our Docker Compose setup, leave this blank (it defaults to the internal proxied route <code>/searxng</code>). For external custom instances, specify the full origin (e.g. <code>https://searx.be</code>).
                </p>
              </div>

              {/* How it works */}
              <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] p-3.5 space-y-2">
                <h4 className="font-display text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-emerald-400" />
                  <span>How does Web Search work?</span>
                </h4>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  When Web Search is enabled, Context queries SearXNG before the LLM generation starts, retrieves the top search snippets, and automatically injects them into the model's context. This allows any model (local Ollama, Gemini, or OpenRouter) to answer with up-to-date information.
                </p>
              </div>

            </div>
          ) : activeTab === 'preferences' ? (
            <div className="space-y-5 animate-fade-in select-none">
              
              <div>
                <label className="mb-2.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Speech-to-Text Engine
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'native', name: 'Browser Native', desc: 'Fast, cloud-assisted in some browsers' },
                    { id: 'local', name: 'Local Whisper', desc: '100% private, runs offline, WASM (75MB)' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSpeechEngineChange(opt.id as any)}
                      className={`flex flex-col items-center justify-center rounded-xl border py-2.5 px-2 text-center transition cursor-pointer ${
                        (settings.speechToTextEngine || 'native') === opt.id
                          ? 'border-brand-500 bg-brand-500/10 text-white font-semibold'
                          : 'border-white/[0.03] bg-white/[0.015] text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
                      }`}
                    >
                      <span className="text-xs font-semibold">{opt.name}</span>
                      <span className="text-[8px] text-slate-500 mt-0.5">{opt.desc}</span>
                    </button>
                  ))}
                </div>

                {settings.speechToTextEngine === 'local' && (
                  <div className="mt-3 rounded-xl border border-white/[0.03] bg-white/[0.01] p-3 space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-slate-400 uppercase tracking-wider">Whisper Model Status</span>
                      <span className={`font-bold px-2 py-0.5 rounded-full ${
                        localSttStatus === 'ready' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : localSttStatus === 'loading'
                            ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                            : localSttStatus === 'error'
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : 'bg-slate-800 text-slate-400 border border-white/[0.03]'
                      }`}>
                        {localSttStatus === 'idle' && 'Not Loaded'}
                        {localSttStatus === 'loading' && 'Downloading...'}
                        {localSttStatus === 'ready' && 'Ready / Cached'}
                        {localSttStatus === 'error' && 'Load Failed'}
                        {localSttStatus === 'transcribing' && 'Transcribing...'}
                      </span>
                    </div>

                    {localSttStatus === 'loading' && (
                      <div className="space-y-1">
                        <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div 
                            className="h-full bg-brand-500 transition-all duration-300" 
                            style={{ width: `${localSttProgress}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[8px] font-bold text-brand-400">
                          <span>DOWNLOADING MODEL WEIGHTS</span>
                          <span>{localSttProgress.toFixed(0)}%</span>
                        </div>
                      </div>
                    )}

                    {localSttStatus === 'idle' && (
                      <button
                        type="button"
                        onClick={() => localSpeech.preloadModel()}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-brand-500/30 hover:border-brand-500 bg-brand-500/5 hover:bg-brand-500/10 text-[10px] font-semibold text-brand-400 hover:text-brand-300 py-1.5 transition active:scale-98 cursor-pointer select-none"
                      >
                        <Download className="h-3 w-3" />
                        <span>Pre-download Whisper Model (~75MB)</span>
                      </button>
                    )}

                    {localSttStatus === 'ready' && (
                      <p className="text-[9px] text-slate-500 italic text-center font-medium">
                        Model cached in browser memory & IndexedDB. Voice typing will work 100% offline.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Readability Font Size
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'sm', name: 'Small', desc: 'Compact view' },
                    { id: 'base', name: 'Medium', desc: 'Balanced default' },
                    { id: 'lg', name: 'Large', desc: 'High readability' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onFontSizeChanged(opt.id as any)}
                      className={`flex flex-col items-center justify-center rounded-xl border py-2.5 px-2 text-center transition cursor-pointer ${
                        fontSize === opt.id
                          ? 'border-brand-500 bg-brand-500/10 text-white font-semibold'
                          : 'border-white/[0.03] bg-white/[0.015] text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
                      }`}
                    >
                      <span className="text-xs font-semibold">{opt.name}</span>
                      <span className="text-[8px] text-slate-500 mt-0.5">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  App Color Theme
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'light', name: 'Light Mode', desc: 'Clean & crisp' },
                    { id: 'dark', name: 'Dark Mode', desc: 'Premium deep slate' },
                    { id: 'system', name: 'System', desc: 'Sync with browser' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onThemeChanged(opt.id as any)}
                      className={`flex flex-col items-center justify-center rounded-xl border py-2.5 px-2 text-center transition cursor-pointer ${
                        theme === opt.id
                          ? 'border-brand-500 bg-brand-500/10 text-white font-semibold'
                          : 'border-white/[0.03] bg-white/[0.015] text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
                      }`}
                    >
                      <span className="text-xs font-semibold">{opt.name}</span>
                      <span className="text-[8px] text-slate-500 mt-0.5">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">

              {activeChat && activeChat.messages && activeChat.messages.length > 0 && (
                <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] p-3.5 space-y-3">
                  <div>
                    <h3 className="font-display text-xs font-semibold text-white">Export Conversation</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                      Download the transcript of your current conversation in different formats.
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={exportToMarkdown}
                      className="flex items-center gap-1.5 rounded-lg border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.06] text-xs font-semibold text-slate-300 hover:text-white px-3.5 py-1.5 transition active:scale-95 cursor-pointer shadow-sm select-none"
                    >
                      <FileText className="h-3.5 w-3.5 text-brand-500" />
                      <span>Markdown (.md)</span>
                    </button>
                    <button
                      type="button"
                      onClick={exportToJSON}
                      className="flex items-center gap-1.5 rounded-lg border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.06] text-xs font-semibold text-slate-300 hover:text-white px-3.5 py-1.5 transition active:scale-95 cursor-pointer shadow-sm select-none"
                    >
                      <Terminal className="h-3.5 w-3.5 text-emerald-500" />
                      <span>JSON (.json)</span>
                    </button>
                    <button
                      type="button"
                      onClick={exportToPDF}
                      className="flex items-center gap-1.5 rounded-lg border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.06] text-xs font-semibold text-slate-300 hover:text-white px-3.5 py-1.5 transition active:scale-95 cursor-pointer shadow-sm select-none"
                    >
                      <FileText className="h-3.5 w-3.5 text-sky-500" />
                      <span>Print / PDF</span>
                    </button>
                  </div>
                </div>
              )}
              
              <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] p-3.5 space-y-3 flex items-center justify-between">
                <div>
                  <h3 className="font-display text-xs font-semibold text-white">Export Global Backup</h3>
                </div>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 px-3.5 py-1.5 text-xs font-medium text-white transition active:scale-95 cursor-pointer shadow-sm shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download JSON</span>
                </button>
              </div>

              <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] p-3.5 space-y-3">
                <div>
                  <h3 className="font-display text-xs font-semibold text-white">Import Global Backup</h3>
                </div>

                {importError && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-red-950/20 border border-red-900/30 p-2 text-[10px] text-red-400">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{importError}</span>
                  </div>
                )}
                {importSuccess && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-emerald-950/20 border border-emerald-900/30 p-2 text-[10px] text-emerald-400">
                    <CheckSquare className="h-3.5 w-3.5 shrink-0" />
                    <span>Backup restored successfully!</span>
                  </div>
                )}

                <div className="relative flex items-center justify-center rounded-xl border border-dashed border-white/[0.08] hover:border-brand-500/30 bg-slate-950/30 p-4 transition duration-300">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportBackup}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="text-center space-y-1 pointer-events-none select-none">
                    <Plus className="h-4 w-4 text-slate-500 mx-auto" />
                    <span className="text-[10px] font-semibold text-slate-300 block">Choose Backup File</span>
                    <span className="text-[9px] text-slate-500 block">Accepts .json files</span>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="rounded-xl border border-red-900/30 bg-red-950/5 p-3.5 space-y-3">
                <div>
                  <h3 className="font-display text-xs font-semibold text-red-400">Danger Zone</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    Permanently erase all conversations, API keys, custom system prompts, and preferences from your browser. This action is irreversible.
                  </p>
                </div>
                
                {confirmDeleteAll ? (
                  <div className="flex items-center gap-2 select-none">
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.clear();
                        window.location.reload();
                      }}
                      className="rounded-lg bg-red-600 hover:bg-red-500 px-3.5 py-1.5 text-[10px] font-semibold text-white transition cursor-pointer active:scale-95"
                    >
                      Yes, Delete Everything
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAll(false)}
                      className="rounded-lg border border-white/[0.05] bg-white/[0.01] px-3.5 py-1.5 text-[10px] font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAll(true)}
                    className="rounded-lg bg-red-950/20 border border-red-900/40 hover:bg-red-950/40 px-3.5 py-1.5 text-[10px] font-medium text-red-400 hover:text-red-300 transition cursor-pointer select-none"
                  >
                    Delete All Data
                  </button>
                )}
              </div>

            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end border-t border-white/[0.015] bg-slate-950/10 px-5 py-3.5 gap-2.5">
          <span className="text-[10px] text-slate-500 font-medium select-none mr-auto">100% Serverless & Private</span>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/[0.05] bg-white/[0.01] px-4 py-2 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveSettings}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 px-5 py-2 text-xs font-semibold text-white shadow-md active:scale-95 transition"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save Settings</span>
          </button>
        </div>

      </div>
    </div>
  );
};
