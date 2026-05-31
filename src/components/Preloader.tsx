import React from "react";

interface PreloaderProps {
 message?: string;
}

export default function Preloader({ message = "Loading..." }: PreloaderProps) {
 return (
 <div className="min-h-screen w-full flex flex-col items-center justify-center bg-white z-50 animate-fadeIn">
 {/* GL Orange spinner */}
 <div className="relative w-12 h-12">
 <div className="w-12 h-12 border-2 border-[#e8e8e8] border-t-[#ff4f00] rounded-none animate-spin-fast" />
 </div>
 <p className="mt-5 text-[11px] font-semibold text-[#9a9a9a] uppercase tracking-widest">
 {message}
 </p>
 </div>
 );
}
