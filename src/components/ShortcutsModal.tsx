import React from 'react';
import { X, Keyboard, MessageSquare, Search, Sparkles, HelpCircle } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    {
      keys: ['Ctrl', 'Shift', 'N'],
      macKeys: ['⌘', 'Shift', 'N'],
      desc: 'Create a new conversation session',
      icon: <MessageSquare className="h-4 w-4 text-brand-500" />
    },
    {
      keys: ['Ctrl', '/'],
      macKeys: ['⌘', '/'],
      desc: 'Focus the message composer input',
      icon: <Search className="h-4 w-4 text-sky-500" />
    },
    {
      keys: ['?'],
      macKeys: ['?'],
      desc: 'Toggle this keyboard shortcut guide',
      icon: <HelpCircle className="h-4 w-4 text-amber-500" />
    },
    {
      keys: ['Esc'],
      macKeys: ['Esc'],
      desc: 'Close active settings panels or overlays',
      icon: <X className="h-4 w-4 text-red-500" />
    }
  ];

  const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-md animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="glass-panel relative w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl z-10">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/[0.015] px-5 py-4 bg-slate-950/20">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500/10 text-brand-500">
              <Keyboard className="h-3.5 w-3.5" />
            </div>
            <h2 className="font-display text-xs font-semibold tracking-wide text-white">Keyboard Navigation</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
            aria-label="Close shortcuts guide"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          <p className="text-[11px] text-slate-500 font-medium select-none">
            Boost your productivity using these elegant, built-in keyboard navigation shortcuts:
          </p>

          <div className="space-y-2">
            {shortcuts.map((shortcut, idx) => {
              const activeKeys = isMac ? shortcut.macKeys : shortcut.keys;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl border border-white/[0.03] bg-white/[0.01] p-3 hover:bg-white/[0.02] transition duration-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 p-1.5 rounded-lg bg-slate-900 border border-white/[0.04]">
                      {shortcut.icon}
                    </div>
                    <span className="text-[11px] font-medium text-slate-400 truncate">{shortcut.desc}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {activeKeys.map((key, keyIdx) => (
                      <React.Fragment key={keyIdx}>
                        {keyIdx > 0 && <span className="text-[9px] text-slate-700 font-bold select-none">+</span>}
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-950 border border-white/[0.05] text-[9px] font-mono font-bold text-brand-400 select-none shadow-[0_1.5px_0_rgba(0,0,0,0.6)]">
                          {key}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-white/[0.015] bg-slate-950/20 px-5 py-3 flex items-center justify-between text-[9px] font-medium text-slate-600 select-none">
          <span className="flex items-center gap-1">
            <Sparkles className="h-2.5 w-2.5 text-brand-500/80" />
            Designed for power-users
          </span>
          <span>Press Esc to close</span>
        </div>
      </div>
    </div>
  );
};
