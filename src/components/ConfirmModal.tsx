"use client";

import { AlertTriangle, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  isDestructive?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  isDestructive = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-none shadow-2xl w-full max-w-md border border-[#e8e8e8] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full flex-shrink-0 ${isDestructive ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1 pt-1">
              <h3 className="text-lg font-bold text-[#1c1b1f] mb-2">{title}</h3>
              <div className="text-sm text-[#6b6b6b] leading-relaxed">
                {message}
              </div>
            </div>
            <button 
              onClick={onClose}
              className="text-[#9a9a9a] hover:text-[#1c1b1f] transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="bg-[#f7f7f7] px-6 py-4 flex flex-col-reverse sm:flex-row justify-end gap-3 border-t border-[#e8e8e8]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-[#6b6b6b] bg-white border border-[#e8e8e8] hover:bg-[#f7f7f7] transition-colors rounded-none w-full sm:w-auto text-center"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-sm font-bold text-white transition-colors rounded-none w-full sm:w-auto text-center shadow-xs ${
              isDestructive 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-[#ff4f00] hover:bg-[#e64500]'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
