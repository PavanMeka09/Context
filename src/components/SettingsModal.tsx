/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from 'react';
import { PRESET_PROMPTS, Storage, PROVIDERS } from '../utils/storage';
import type { Settings, SystemPrompt, Chat, MemoryItem, ProviderProfile, ProviderType } from '../utils/storage';
import { fetchModels, testOllamaConnection, type ModelOption } from '../utils/api';
import { X, Eye, EyeOff, Save, Plus, Trash2, Edit2, AlertCircle, Loader2, Download, CheckSquare, ChevronDown, Check, Globe, Search, Cpu, Database, FileText, Terminal, Brain } from 'lucide-react';
import { testSearxngConnection } from '../utils/searxng';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeChat: Chat | null;
  onSettingsSaved: (settings: Settings) => void;
  onPromptsChanged: () => void;
  onBackupImported: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  activeChat,
  onSettingsSaved,
  onPromptsChanged,
  onBackupImported
}) => {
  const [activeTab, setActiveTab] = useState<'provider' | 'prompts' | 'websearch' | 'memory' | 'backup'>('provider');
  const [settings, setSettings] = useState<Settings>(() => Storage.getSettings());
  const [memories, setMemories] = useState<MemoryItem[]>(() => Storage.getMemories());
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState<'preference' | 'project' | 'conversation' | 'other'>('preference');

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
        <style>
          body {
            font-family: Outfit, system-ui, -apple-system, "Segoe UI", sans-serif;
            background: white;
            color: #1c1917;
            margin: 0;
            padding: 40px;
            line-height: 1.6;
          }
          .header {
            border-bottom: 2px solid #e7e5e4;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .title {
            font-size: 26px;
            font-weight: 700;
            color: #1c1917;
            margin: 0;
          }
          .meta {
            font-size: 11px;
            color: #78716c;
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
            color: #78716c;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 6px;
          }
          .message-content {
            font-size: 14px;
            color: #44403c;
          }
          .user-content {
            background: #f5f5f4;
            border-left: 3px solid #1c1917;
            padding: 12px 16px;
            border-radius: 0 8px 8px 0;
          }
          .assistant-content {
            padding: 4px 0;
          }
          pre {
            background: #1c1917 !important;
            color: #f5f5f4 !important;
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
            background: #e7e5e4;
            color: #000000;
            padding: 2px 4px;
            border-radius: 4px;
          }
          pre code {
            background: transparent;
            color: inherit;
            padding: 0;
            border-radius: 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
            font-size: 13px;
          }
          th, td {
            padding: 8px 12px;
            border: 1px solid #e7e5e4;
            text-align: left;
          }
          th {
            background: #f5f5f4;
            color: #1c1917;
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

  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [testingOllamaConnection, setTestingOllamaConnection] = useState(false);
  const [ollamaTestResult, setOllamaTestResult] = useState<{ success: boolean; message: string } | null>(null);

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

  const handleTestOllamaConnection = async () => {
    setTestingOllamaConnection(true);
    setOllamaTestResult(null);
    try {
      const targetUrl = settings.localUrl || 'http://localhost:11434';
      const result = await testOllamaConnection(targetUrl);
      setTestingOllamaConnection(false);
      if (result.success) {
        setOllamaTestResult({
          success: true,
          message: result.message || `Successfully connected to Ollama! (${result.models?.length || 0} model(s) found)`
        });
        loadModelsForProvider({
          provider: 'ollama',
          apiKey: settings.apiKey,
          localUrl: targetUrl,
          model: settings.model
        });
      } else {
        setOllamaTestResult({
          success: false,
          message: `Connection failed: ${result.error || 'Check that Ollama is running.'}`
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Check that Ollama is running.';
      setTestingOllamaConnection(false);
      setOllamaTestResult({
        success: false,
        message: `Connection failed: ${errorMsg}`
      });
    }
  };

  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingProfileName, setEditingProfileName] = useState('');
  const [customPrompts, setCustomPrompts] = useState<SystemPrompt[]>(() => Storage.getCustomPrompts());
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [promptName, setPromptName] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);

  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const handleExportBackup = async () => {
    const jsonStr = await Storage.exportData();
    const blob = new Blob([jsonStr], { type: 'application/json' });
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
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const result = await Storage.importData(text);

        if (!result.success) {
          throw new Error(result.error || 'Failed to import backup data');
        }

        setImportSuccess(true);
        onBackupImported();
        onPromptsChanged();
        
        setTimeout(() => setImportSuccess(false), 3000);
      } catch (err) {
        console.error('Failed to parse backup JSON', err);
        setImportError(err instanceof Error ? err.message : 'Invalid backup JSON file.');
      }
    };
    reader.readAsText(file);
  };
  const updateActiveProfileState = useCallback(
    (updater: (activeProfile: ProviderProfile) => Partial<ProviderProfile>) => {
      setSettings(prev => {
        const active = Storage.getActiveProfile(prev);
        return Storage.updateActiveProfile(prev, updater(active));
      });
    },
    []
  );

  const loadModelsForProvider = useCallback(
    async (config: { provider?: ProviderType; apiKey?: string; model?: string; localUrl?: string }) => {
      const provider = config.provider || 'gemini';
      const key = config.apiKey || '';
      const localUrl = config.localUrl || settings.localUrl;
      const activeModelId = config.model;
      setLoadingModels(true);
      setModelError(null);
      setModelSearchQuery('');
      try {
        const fetched = await fetchModels({ provider, apiKey: key, localUrl });
        setModels(fetched);

        if (fetched.length > 0) {
          const modelExists = fetched.some(m => m.id === activeModelId);
          if (!modelExists) {
            updateActiveProfileState(() => ({ model: fetched[0].id }));
          }
        } else {
          updateActiveProfileState(() => ({ model: '' }));
        }
      } catch {
        const providerName = PROVIDERS[provider]?.name || 'API Provider';
        setModelError(`Failed to load dynamic models for ${providerName}.`);
      } finally {
        setLoadingModels(false);
      }
    },
    [updateActiveProfileState, settings.localUrl, setModelSearchQuery]
  );

  useEffect(() => {
    setTimeout(() => {
      loadModelsForProvider(settings);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadModelsForProvider]);

  useEffect(() => {
    const handleEscapeCapture = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modelDropdownOpen) {
          e.preventDefault();
          e.stopPropagation();
          setModelDropdownOpen(false);
          setModelSearchQuery('');
        }
      }
    };

    if (modelDropdownOpen) {
      window.addEventListener('keydown', handleEscapeCapture, true);
      return () => window.removeEventListener('keydown', handleEscapeCapture, true);
    }
  }, [modelDropdownOpen]);

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const apiKey = e.target.value;
    updateActiveProfileState(() => ({ apiKey }));
  };

  const handleLocalUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const localUrl = e.target.value;
    updateActiveProfileState(() => ({ localUrl }));
  };

  const handleProviderChange = (newProvider: ProviderType) => {
    const defaultModel = PROVIDERS[newProvider]?.defaultModel || (newProvider === 'ollama' ? 'llama3.2' : 'gemini-3.6-flash');
    const localUrl = newProvider === 'ollama' ? (settings.localUrl || 'http://localhost:11434') : settings.localUrl;
    updateActiveProfileState(() => ({ provider: newProvider, model: defaultModel, localUrl }));
    loadModelsForProvider({ provider: newProvider, apiKey: settings.apiKey, model: defaultModel, localUrl });
  };

  const handleAddProfile = () => {
    const name = `Profile ${(settings.profiles?.length || 0) + 1}`;
    const nextSettings = Storage.addProfile(settings, { name });
    const nextActive = Storage.getActiveProfile(nextSettings);
    setSettings(nextSettings);
    if (nextActive) {
      setEditingProfileId(nextActive.id);
      setEditingProfileName(nextActive.name);
      loadModelsForProvider(nextActive);
    }
  };

  const handleSelectProfile = (id: string) => {
    const updated = Storage.switchProfile(settings, id);
    const nextActive = Storage.getActiveProfile(updated);
    setSettings(updated);
    if (nextActive) {
      loadModelsForProvider(nextActive);
    }
  };

  const handleStartRenameProfile = (profile: ProviderProfile) => {
    setEditingProfileId(profile.id);
    setEditingProfileName(profile.name);
  };

  const handleSaveProfileName = (id: string) => {
    if (!editingProfileName.trim()) return;
    setSettings(prev => ({
      ...prev,
      profiles: (prev.profiles || []).map(p =>
        p.id === id ? { ...p, name: editingProfileName.trim() } : p
      )
    }));
    setEditingProfileId(null);
    setEditingProfileName('');
  };

  const handleDeleteProfile = (id: string) => {
    const nextSettings = Storage.deleteProfile(settings, id);
    const nextActive = Storage.getActiveProfile(nextSettings);
    setSettings(nextSettings);
    if (nextActive) {
      loadModelsForProvider(nextActive);
    }
  };

  const handleKeyBlur = () => {
    loadModelsForProvider(settings);
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

  const handleAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryContent.trim()) return;

    const newItem: MemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      content: newMemoryContent.trim(),
      category: newMemoryCategory,
      createdAt: new Date().toISOString()
    };

    const updated = [newItem, ...memories];
    setMemories(updated);
    Storage.saveMemories(updated);
    setNewMemoryContent('');
  };

  const handleDeleteMemory = (id: string) => {
    const updated = memories.filter(m => m.id !== id);
    setMemories(updated);
    Storage.saveMemories(updated);
  };

  const handleClearAllMemories = () => {
    if (window.confirm('Are you sure you want to permanently delete all personal memories?')) {
      setMemories([]);
      Storage.saveMemories([]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-fade-in">
      <div className="flex h-[520px] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-muted/40">
          <h2 className="font-sans text-sm font-semibold tracking-wide text-foreground">Settings</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition active:scale-95 cursor-pointer"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-border bg-muted/20 px-5 overflow-x-auto scrollbar-none">
          {[
            { id: 'provider', name: 'AI Provider', icon: <Cpu className="h-3.5 w-3.5" /> },
            { id: 'prompts', name: 'System Prompts', icon: <FileText className="h-3.5 w-3.5" /> },
            { id: 'websearch', name: 'Web Search', icon: <Globe className="h-3.5 w-3.5" /> },
            { id: 'memory', name: 'Memory', icon: <Brain className="h-3.5 w-3.5" /> },
            { id: 'backup', name: 'Backup', icon: <Database className="h-3.5 w-3.5" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`border-b-2 px-3 py-2.5 text-xs font-medium transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'border-primary text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
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
              
              {/* Provider Profiles Management */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Provider Profile
                  </label>
                  <button
                    type="button"
                    onClick={handleAddProfile}
                    className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New Profile</span>
                  </button>
                </div>

                {editingProfileId === settings.activeProfileId ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={editingProfileName}
                      onChange={e => setEditingProfileName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveProfileName(settings.activeProfileId!);
                        if (e.key === 'Escape') setEditingProfileId(null);
                      }}
                      autoFocus
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveProfileName(settings.activeProfileId!)}
                      className="rounded p-1.5 text-primary hover:bg-accent cursor-pointer"
                      title="Save name"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingProfileId(null)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-accent cursor-pointer"
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <select
                        aria-label="Select Provider Profile"
                        value={settings.activeProfileId || ''}
                        onChange={e => handleSelectProfile(e.target.value)}
                        className="w-full appearance-none rounded-md border border-input bg-background pl-3.5 pr-8 py-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                      >
                        {(settings.profiles || []).map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const activeProf = (settings.profiles || []).find(p => p.id === settings.activeProfileId);
                        if (activeProf) handleStartRenameProfile(activeProf);
                      }}
                      className="rounded-md border border-input bg-background p-2 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition shrink-0"
                      title="Rename profile"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (settings.activeProfileId) handleDeleteProfile(settings.activeProfileId);
                      }}
                      disabled={(settings.profiles || []).length <= 1}
                      className="rounded-md border border-input bg-background p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition shrink-0"
                      title="Delete profile"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Provider Selection */}
              <div>
                <label htmlFor="provider-select" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  API Provider
                </label>
                <div className="relative">
                  <select
                    id="provider-select"
                    value={settings.provider || 'gemini'}
                    onChange={e => handleProviderChange(e.target.value as ProviderType)}
                    className="w-full appearance-none rounded-md border border-input bg-background pl-3.5 pr-8 py-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                  >
                    {Object.values(PROVIDERS).map(prov => (
                      <option key={prov.id} value={prov.id}>
                        {prov.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              {/* Ollama Server URL (when provider is ollama) */}
              {settings.provider === 'ollama' && (
                <div className="space-y-1.5 animate-fade-in">
                  <label htmlFor="ollama-url-input" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Ollama Instance URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="ollama-url-input"
                      type="text"
                      value={settings.localUrl || ''}
                      onChange={handleLocalUrlChange}
                      onBlur={() => loadModelsForProvider(settings)}
                      placeholder="http://localhost:11434"
                      className="flex-1 min-w-0 rounded-md border border-input bg-background px-3.5 py-2 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <button
                      type="button"
                      disabled={testingOllamaConnection}
                      onClick={handleTestOllamaConnection}
                      className="flex h-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent text-[10px] font-semibold text-muted-foreground hover:text-foreground px-3 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    >
                      {testingOllamaConnection ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Testing...</span>
                        </span>
                      ) : (
                        'Test Connection'
                      )}
                    </button>
                  </div>

                  {ollamaTestResult && (
                    <div className={`mt-2 flex items-center gap-1.5 rounded-md border px-3 py-2 text-[10px] animate-fade-in ${
                      ollamaTestResult.success
                        ? 'bg-primary/10 border-primary/20 text-primary'
                        : 'bg-destructive/10 border-destructive/20 text-destructive'
                    }`}>
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{ollamaTestResult.message}</span>
                    </div>
                  )}
                </div>
              )}

              {/* API Key */}
              <div className="space-y-1">
                <label htmlFor="api-key-input" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {(PROVIDERS[settings.provider] || PROVIDERS.gemini).name} API Key {settings.provider === 'ollama' && <span className="text-[9px] font-normal text-muted-foreground lowercase">(optional)</span>}
                </label>
                <div className="relative">
                  <input
                    id="api-key-input"
                    type={showKey ? 'text' : 'password'}
                    value={settings.apiKey}
                    onChange={handleKeyChange}
                    onBlur={handleKeyBlur}
                    placeholder={(PROVIDERS[settings.provider] || PROVIDERS.gemini).keyPlaceholder}
                    className="w-full rounded-md border border-input bg-background pl-3.5 pr-10 py-2 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showKey ? "Hide API key" : "Show API key"}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {/* Model Dropdown */}
              <div className="relative">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Model Selection
                  </label>
                  {loadingModels && (
                    <span className="flex items-center gap-1 text-[10px] text-primary">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Fetching...
                    </span>
                  )}
                </div>
                
                {modelError && (
                  <div className="mb-2.5 flex items-center gap-2 rounded bg-destructive/10 border border-destructive/20 p-2.5 text-[10px] text-destructive">
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
                    }
                  }}
                  disabled={loadingModels || models.length === 0}
                  className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3.5 py-2 text-left text-xs text-foreground cursor-pointer hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <span className="truncate pr-2">
                    {models.find(m => m.id === settings.model)?.name || 
                     (settings.provider === 'ollama' ? 'Select an Ollama model...' : 'Configure API key above to load models...')}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
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
                      className="absolute left-0 right-0 mt-2.5 z-20 flex flex-col max-h-60 rounded-md border border-border bg-popover shadow-md animate-fade-in"
                    >
                      {/* Search Bar */}
                      <div className="p-2 border-b border-border shrink-0 relative select-none">
                        <input
                          type="text"
                          value={modelSearchQuery}
                          onChange={(e) => setModelSearchQuery(e.target.value)}
                          placeholder="Search models..."
                          autoFocus
                          className="w-full bg-background border border-input rounded pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                        />
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
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
                              <div className="text-center py-4 text-xs text-muted-foreground italic select-none">
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
                                updateActiveProfileState(() => ({ model: m.id }));
                                setModelDropdownOpen(false);
                                setModelSearchQuery('');
                              }}
                              className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs transition cursor-pointer ${
                                settings.model === m.id
                                  ? 'bg-accent text-accent-foreground font-semibold'
                                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                              }`}
                            >
                              <span>{m.name}</span>
                              {settings.model === m.id && <Check className="h-3.5 w-3.5 text-primary" />}
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
              <form onSubmit={handleSavePrompt} className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                <h3 className="font-sans text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {editingPromptId ? 'Edit Custom Prompt' : 'Create Custom Prompt'}
                </h3>
                
                {promptError && (
                  <div className="flex items-center gap-1.5 text-[10px] text-destructive">
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
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <textarea
                    placeholder="Instructions (e.g. Act as a software engineer...)"
                    value={promptContent}
                    onChange={e => setPromptContent(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  
                  <div className="flex justify-end gap-1.5">
                    {editingPromptId && (
                      <button
                        type="button"
                        onClick={handleCancelPromptEdit}
                        className="rounded border border-input bg-transparent px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      className="rounded bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 transition active:scale-95 cursor-pointer"
                    >
                      <span>{editingPromptId ? 'Update' : 'Add'}</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* Prompts list */}
              <div className="space-y-4">
                {/* Presets List */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">System Presets (Read-Only)</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {PRESET_PROMPTS.map(p => (
                      <div key={p.id} className="rounded border border-border bg-card p-2 text-left text-[11px] leading-tight select-none">
                        <span className="font-semibold text-foreground block mb-0.5 truncate">{p.name}</span>
                        <span className="text-muted-foreground line-clamp-1 italic">{p.content}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom List */}
                <div className="space-y-1.5 pt-1 border-t border-border">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground block">Your Custom Prompts</span>
                  
                  {customPrompts.length === 0 ? (
                    <p className="text-[10px] italic text-muted-foreground py-1">No custom prompts created yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {customPrompts.map(p => (
                        <div key={p.id} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 gap-3">
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-foreground text-[11px] block truncate">{p.name}</span>
                            <span className="text-muted-foreground text-[10px] italic line-clamp-1 mt-[1px]">{p.content}</span>
                          </div>
                          
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditPrompt(p)}
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground shrink-0"
                              aria-label={`Edit prompt ${p.name}`}
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePrompt(p.id)}
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive shrink-0"
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
              
              {/* Web Search Toggle */}
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 p-3.5">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-foreground">Enable Live Web Search</span>
                  <p className="text-[10px] text-muted-foreground">Allows the AI to search the internet via SearXNG for up-to-date queries.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings(prev => ({ ...prev, isWebSearchEnabled: !prev.isWebSearchEnabled }))}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.isWebSearchEnabled ? 'bg-primary' : 'bg-muted'
                  }`}
                  role="switch"
                  aria-checked={Boolean(settings.isWebSearchEnabled)}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                      settings.isWebSearchEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Auto Web Context Toggle */}
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 p-3.5">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-foreground">Enable Autonomous Web Context (Crawler)</span>
                  <p className="text-[10px] text-muted-foreground">Allows the AI to autonomously crawl and extract clean Markdown from webpages when URLs are referenced.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings(prev => ({ ...prev, isWebContextEnabled: !prev.isWebContextEnabled }))}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.isWebContextEnabled ? 'bg-primary' : 'bg-muted'
                  }`}
                  role="switch"
                  aria-checked={Boolean(settings.isWebContextEnabled)}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                      settings.isWebContextEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* SearXNG Instance URL */}
              <div className="space-y-1.5">
                <label htmlFor="searxng-url-input" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
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
                    placeholder="http://localhost:8082 (Leave blank for default proxy)"
                    className="flex-1 min-w-0 rounded-md border border-input bg-background px-3.5 py-2 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    disabled={testingConnection}
                    onClick={handleTestConnection}
                    className="flex h-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent text-[10px] font-semibold text-muted-foreground hover:text-foreground px-3 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
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
                  <div className={`mt-2 flex items-center gap-1.5 rounded-md border px-3 py-2 text-[10px] animate-fade-in ${
                    connectionTestResult.success
                      ? 'bg-primary/10 border-primary/20 text-primary'
                      : 'bg-destructive/10 border-destructive/20 text-destructive'
                  }`}>
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{connectionTestResult.message}</span>
                  </div>
                )}
                
                <p className="text-[9px] text-muted-foreground leading-relaxed mt-1 select-none">
                  SearXNG is a privacy-respecting search engine. If you are using our Docker Compose setup, leave this blank (it defaults to internal proxy <code>/searxng</code>). For external custom instances, specify the origin (e.g. <code>https://searx.be</code>).
                </p>
              </div>

              {/* How it works */}
              <div className="rounded-md border border-border bg-muted/20 p-3.5 space-y-2">
                <h4 className="font-sans text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-primary" />
                  <span>How do Web Tools work?</span>
                </h4>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  When Web Search is enabled, Context queries SearXNG and supplies results to the AI. When Autonomous Web Context is enabled, Crawl4AI crawls targeted links to extract high-signal Markdown, enabling the AI to answer complex questions from web content.
                </p>
              </div>

            </div>
          ) : activeTab === 'memory' ? (
            <div className="space-y-4 animate-fade-in select-none">
              {/* Enable Memory Toggle */}
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 p-3.5">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-foreground">Enable Personal Memory</span>
                  <p className="text-[10px] text-muted-foreground">Automatically remember preferences, projects, and key notes across chats.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings(prev => ({ ...prev, isMemoryEnabled: !prev.isMemoryEnabled }))}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.isMemoryEnabled ? 'bg-primary' : 'bg-muted'
                  }`}
                  role="switch"
                  aria-checked={settings.isMemoryEnabled}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                      settings.isMemoryEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Add Memory Form */}
              <form onSubmit={handleAddMemory} className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                <h3 className="font-sans text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Add Custom Memory
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="E.g., Prefers Tailwind CSS over vanilla CSS"
                    value={newMemoryContent}
                    onChange={e => setNewMemoryContent(e.target.value)}
                    className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <select
                    value={newMemoryCategory}
                    onChange={e => setNewMemoryCategory(e.target.value as any)}
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-[11px] text-foreground cursor-pointer focus:outline-none shrink-0"
                  >
                    <option value="preference">Preference</option>
                    <option value="project">Project</option>
                    <option value="conversation">Conversation</option>
                    <option value="other">General</option>
                  </select>
                  <button
                    type="submit"
                    className="flex items-center gap-1 rounded bg-primary hover:bg-primary/90 px-3 py-1.5 text-[10px] font-medium text-primary-foreground shadow-sm cursor-pointer shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </form>

              {/* Categorized Memories List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-1 border-b border-border pb-1">
                  <span>Saved Memories ({memories.length})</span>
                  {memories.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllMemories}
                      className="text-destructive hover:underline font-bold"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {memories.length === 0 ? (
                  <div className="rounded-md border border-border bg-card p-6 text-center">
                    <Brain className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
                    <p className="text-[10px] text-muted-foreground italic">No personal memories saved yet. Speak with the AI to auto-populate, or add one manually above.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-48 overflow-y-auto scrollbar-thin pr-1">
                    {([
                      { id: 'preference', name: 'Preferences', desc: 'User habits, settings, and styles' },
                      { id: 'project', name: 'Projects', desc: 'Workspace details, tech stacks, code structures' },
                      { id: 'conversation', name: 'Conversations', desc: 'Summaries, decisions, and takeaways' },
                      { id: 'other', name: 'General', desc: 'Other facts' }
                    ] as const).map(cat => {
                      const items = memories.filter(m => m.category === cat.id);
                      if (items.length === 0) return null;
                      return (
                        <div key={cat.id} className="space-y-1.5">
                          <div className="flex items-baseline justify-between select-none">
                            <span className="text-[9.5px] font-bold text-foreground">{cat.name}</span>
                            <span className="text-[8px] text-muted-foreground">{cat.desc}</span>
                          </div>
                          <div className="space-y-1">
                            {items.map(item => (
                              <div key={item.id} className="flex items-start justify-between rounded-md border border-border bg-card px-2.5 py-1.5 hover:bg-accent hover:text-accent-foreground transition duration-200 gap-2">
                                <span className="text-[10.5px] text-foreground leading-tight flex-1 min-w-0 break-words">{item.content}</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMemory(item.id)}
                                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive transition shrink-0"
                                  aria-label="Delete memory item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">

              {activeChat && activeChat.messages && activeChat.messages.length > 0 && (
                <div className="rounded-md border border-border bg-muted/20 p-3.5 space-y-3">
                  <div>
                    <h3 className="font-sans text-xs font-semibold text-foreground">Export Conversation</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                      Download the transcript of your current conversation in different formats.
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={exportToMarkdown}
                      className="flex items-center gap-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-xs font-semibold px-3.5 py-1.5 transition active:scale-95 cursor-pointer shadow-sm select-none"
                    >
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span>Markdown (.md)</span>
                    </button>
                    <button
                      type="button"
                      onClick={exportToJSON}
                      className="flex items-center gap-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-xs font-semibold px-3.5 py-1.5 transition active:scale-95 cursor-pointer shadow-sm select-none"
                    >
                      <Terminal className="h-3.5 w-3.5 text-primary" />
                      <span>JSON (.json)</span>
                    </button>
                    <button
                      type="button"
                      onClick={exportToPDF}
                      className="flex items-center gap-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-xs font-semibold px-3.5 py-1.5 transition active:scale-95 cursor-pointer shadow-sm select-none"
                    >
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span>Print / PDF</span>
                    </button>
                  </div>
                </div>
              )}
              
              <div className="rounded-md border border-border bg-muted/20 p-3.5 space-y-3 flex items-center justify-between">
                <div>
                  <h3 className="font-sans text-xs font-semibold text-foreground">Export Global Backup</h3>
                </div>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition active:scale-95 cursor-pointer shadow-sm shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download JSON</span>
                </button>
              </div>

              <div className="rounded-md border border-border bg-muted/20 p-3.5 space-y-3">
                <div>
                  <h3 className="font-sans text-xs font-semibold text-foreground">Import Global Backup</h3>
                </div>

                {importError && (
                  <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 border border-destructive/20 p-2 text-[10px] text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{importError}</span>
                  </div>
                )}
                {importSuccess && (
                  <div className="flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/20 p-2 text-[10px] text-primary">
                    <CheckSquare className="h-3.5 w-3.5 shrink-0" />
                    <span>Backup restored successfully!</span>
                  </div>
                )}

                <div className="relative flex items-center justify-center rounded-md border border-dashed border-input hover:border-primary bg-background p-4 transition duration-300">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportBackup}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="text-center space-y-1 pointer-events-none select-none">
                    <Plus className="h-4 w-4 text-muted-foreground mx-auto" />
                    <span className="text-[10px] font-semibold text-foreground block">Choose Backup File</span>
                    <span className="text-[9px] text-muted-foreground block">Accepts .json files</span>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3.5 space-y-3">
                <div>
                  <h3 className="font-sans text-xs font-semibold text-destructive">Danger Zone</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                    Permanently erase all conversations, API keys, custom system prompts, and preferences from your browser. This action is irreversible.
                  </p>
                </div>
                
                {confirmDeleteAll ? (
                  <div className="flex items-center gap-2 select-none">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await fetch('/api/schedules/clear-all', { method: 'POST' });
                        } catch (err) {
                          console.error('Failed to clear scheduling database on server', err);
                        }
                        localStorage.clear();
                        window.location.reload();
                      }}
                      className="rounded-md bg-destructive hover:bg-destructive/90 px-3.5 py-1.5 text-[10px] font-semibold text-destructive-foreground transition cursor-pointer active:scale-95"
                    >
                      Yes, Delete Everything
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAll(false)}
                      className="rounded-md border border-input bg-transparent px-3.5 py-1.5 text-[10px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAll(true)}
                    className="rounded-md bg-destructive/10 border border-destructive/20 hover:bg-destructive/20 px-3.5 py-1.5 text-[10px] font-medium text-destructive transition cursor-pointer select-none"
                  >
                    Delete All Data
                  </button>
                )}
              </div>

            </div>
          )}
        </div>
        <div className="flex items-center justify-end border-t border-border bg-muted/40 px-5 py-3.5 gap-2.5">
          <button
            onClick={onClose}
            className="rounded-md border border-input bg-transparent px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveSettings}
            className="flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 px-5 py-2 text-xs font-semibold text-primary-foreground shadow-sm active:scale-95 transition"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Save Settings</span>
          </button>
        </div>

      </div>
    </div>
  );
};
