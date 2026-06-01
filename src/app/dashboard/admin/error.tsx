"use client";

export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center max-w-sm space-y-3">
        <h2 className="text-sm font-black text-[#4a4a4a] uppercase tracking-widest">
          Something went wrong
        </h2>
        <p className="text-xs text-[#9a9a9a]">
          This section could not be loaded.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-[#1c1b1f] text-white text-xs font-bold hover:bg-black transition rounded-none"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}