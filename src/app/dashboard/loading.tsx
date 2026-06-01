export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md space-y-4">
        <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
          <div className="h-full bg-[#ff4f00] rounded-full animate-[loadingBar_2s_ease-in-out_infinite]"
            style={{ width: "40%" }} />
        </div>
        <p className="text-xs text-[#9a9a9a] text-center font-semibold tracking-wider uppercase">
          Loading dashboard...
        </p>
      </div>
    </div>
  );
}
