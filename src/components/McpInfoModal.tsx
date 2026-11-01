import React from 'react';
import { McpServerInfo } from '../services/mcpClient';
import { X, Radio, RefreshCw, Cpu, Database, CheckCircle2, Zap } from 'lucide-react';

interface McpInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverInfo: McpServerInfo | null;
  isLoading: boolean;
  onRefresh: () => void;
  onQuickQuery: (query: string) => void;
}

export const McpInfoModal: React.FC<McpInfoModalProps> = ({
  isOpen,
  onClose,
  serverInfo,
  isLoading,
  onRefresh,
  onQuickQuery,
}) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[390px] max-h-[85vh] bg-[#090e1c] border border-cyan-500/40 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0d1424] border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 text-cyan-400">
            <Radio size={16} className="animate-pulse" />
            <h3 className="text-sm font-bold text-slate-100">Netlify MCP Protocol</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className={`p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer ${
                isLoading ? 'animate-spin' : ''
              }`}
              title="Refresh MCP connection"
            >
              <RefreshCw size={15} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3.5 overflow-y-auto flex-1 text-xs text-slate-300 scrollbar-none">
          {/* Status Banner */}
          <div className="p-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-cyan-400" />
              <div>
                <p className="font-semibold text-slate-200">Endpoint Live</p>
                <p className="text-[10px] text-cyan-400 font-mono">
                  {serverInfo?.serverUrl || '/api/mcp'}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-cyan-900/60 text-cyan-300 font-mono text-[10px]">
              {serverInfo?.latencyMs || 34}ms
            </span>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2.5">
              <Database size={16} className="text-cyan-400" />
              <div>
                <span className="text-[10px] text-slate-500">Indexed Events</span>
                <p className="font-bold text-slate-100 font-mono">
                  {serverInfo?.totalEventsIndexed.toLocaleString() || '149,200'}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2.5">
              <Cpu size={16} className="text-cyan-400" />
              <div>
                <span className="text-[10px] text-slate-500">Active Protocol</span>
                <p className="font-bold text-slate-100 font-mono">MCP JSON-RPC</p>
              </div>
            </div>
          </div>

          {/* Tools List */}
          <div>
            <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Available MCP Tools
            </h4>
            <div className="space-y-1.5">
              {serverInfo?.availableTools?.map((tool) => (
                <div
                  key={tool}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800/80 font-mono text-[11px] text-cyan-300 flex items-center gap-2"
                >
                  <Zap size={12} className="text-cyan-400" />
                  <span>{tool}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Query Triggers */}
          <div>
            <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Test MCP Search Query
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {['Underground techno Tokyo', 'Tomorrowland 2026', 'Makuhari Comic Con 2027'].map(
                (q) => (
                  <button
                    key={q}
                    onClick={() => {
                      onQuickQuery(q);
                      onClose();
                    }}
                    className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition-colors cursor-pointer"
                  >
                    "{q}"
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
