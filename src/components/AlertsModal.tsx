import React from 'react';
import { AlertItem } from '../types';
import { X, AlertTriangle, Info, Bell, Check } from 'lucide-react';

interface AlertsModalProps {
  alerts: AlertItem[];
  isOpen: boolean;
  onClose: () => void;
  onDismissAlert: (id: string) => void;
}

export const AlertsModal: React.FC<AlertsModalProps> = ({
  alerts,
  isOpen,
  onClose,
  onDismissAlert,
}) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[390px] max-h-[80vh] bg-[#090e1c] border border-amber-500/30 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0d1424] border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle size={18} />
            <h3 className="text-sm font-bold text-slate-100">Live Advisories</h3>
            <span className="px-1.5 py-0.5 rounded-full bg-amber-950 text-amber-300 text-[10px] font-mono">
              {alerts.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Alerts List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 scrollbar-none">
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              <Bell size={24} className="mx-auto text-slate-600 mb-2" />
              All venues and weather conditions normal.
            </div>
          ) : (
            alerts.map((alt) => (
              <div
                key={alt.id}
                className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 hover:border-amber-500/40 transition-all space-y-1.5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <Info size={14} className="text-amber-400 shrink-0" />
                    <span>{alt.title}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{alt.time}</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {alt.details}
                </p>
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] text-slate-400">
                  <span>{alt.location}</span>
                  <button
                    onClick={() => onDismissAlert(alt.id)}
                    className="flex items-center gap-1 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    <Check size={12} />
                    <span>Dismiss</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
