"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md space-y-4">
        <div className="w-12 h-12 mx-auto border-2 border-[#e8e8e8] flex items-center justify-center rounded-none">
          <span className="text-2xl font-black text-[#9a9a9a]">!</span>
        </div>
        <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest">
          Failed to load dashboard
        </h2>
        <p className="text-xs text-[#9a9a9a] leading-relaxed">
          The dashboard data could not be loaded. This may be a temporary network issue.
        </p>
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-[#1c1b1f] text-white text-xs font-bold hover:bg-black transition rounded-none"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
