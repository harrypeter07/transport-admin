import React from "react";
import { Loader2 } from "lucide-react";

interface PreloaderProps {
  message?: string;
}

export default function Preloader({ message = "Loading Dashboard Data..." }: PreloaderProps) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50/50 backdrop-blur-sm z-50 animate-fadeIn">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin-fast shadow-lg"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <Loader2 className="w-6 h-6 text-slate-800 animate-spin" style={{ animationDuration: '2s' }} />
        </div>
      </div>
      <p className="mt-6 text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse" style={{ animationDuration: '1s' }}>
        {message}
      </p>
    </div>
  );
}
