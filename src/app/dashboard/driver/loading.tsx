export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-full max-w-sm space-y-3">
        <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
          <div className="h-full bg-[#ff4f00] rounded-full animate-pulse" style={{ width: "45%" }} />
        </div>
        <p className="text-xs text-[#9a9a9a] text-center font-semibold tracking-wider uppercase">
          Loading...
        </p>
      </div>
    </div>
  );
}