import React from 'react';
import { X, Keyboard, MessageSquare, Search, HelpCircle, Terminal } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    {
      keys: ['Ctrl', 'K'],
      macKeys: ['⌘', 'K'],
      desc: 'Toggle universal command palette',
      icon: <Terminal className="h-4 w-4 text-foreground" />
    },
    {
      keys: ['Ctrl', 'Shift', 'N'],
      macKeys: ['⌘', 'Shift', 'N'],
      desc: 'Create a new conversation session',
      icon: <MessageSquare className="h-4 w-4 text-foreground" />
    },
    {
      keys: ['Ctrl', '/'],
      macKeys: ['⌘', '/'],
      desc: 'Focus the message composer input',
      icon: <Search className="h-4 w-4 text-foreground" />
    },
    {
      keys: ['?'],
      macKeys: ['?'],
      desc: 'Toggle this keyboard shortcut guide',
      icon: <HelpCircle className="h-4 w-4 text-foreground" />
    },
    {
      keys: ['Esc'],
      macKeys: ['Esc'],
      desc: 'Close active settings panels or overlays',
      icon: <X className="h-4 w-4 text-foreground" />
    }
  ];

  const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-sm overflow-hidden rounded-lg border border-border bg-background shadow-lg z-10">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/40">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 border border-primary/20 text-primary">
              <Keyboard className="h-3.5 w-3.5" />
            </div>
            <h2 className="font-sans text-xs font-semibold tracking-wide text-foreground">Keyboard Navigation</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-all cursor-pointer"
            aria-label="Close shortcuts guide"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            {shortcuts.map((shortcut, idx) => {
              const activeKeys = isMac ? shortcut.macKeys : shortcut.keys;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-md border border-border bg-card p-3 hover:bg-accent transition duration-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 p-1.5 rounded bg-muted border border-border">
                      {shortcut.icon}
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground truncate">{shortcut.desc}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {activeKeys.map((key, keyIdx) => (
                      <React.Fragment key={keyIdx}>
                        {keyIdx > 0 && <span className="text-[9px] text-muted-foreground font-bold select-none">+</span>}
                        <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[9px] font-mono font-bold text-foreground select-none shadow-sm">
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
        <div className="border-t border-border bg-muted/40 px-5 py-2.5 flex items-center justify-end text-[9px] font-medium text-muted-foreground select-none">
          <span>Press Esc to close</span>
        </div>
      </div>
    </div>
  );
};
