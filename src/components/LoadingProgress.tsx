"use client";

export type ProgressStage = {
  key: string;
  label: string;
  weight: number;
};

export default function LoadingProgress({
  stages,
  completed,
  currentLabel,
}: {
  stages: ProgressStage[];
  completed: Set<string>;
  currentLabel?: string;
}) {
  const pct = Math.min(
    100,
    Math.round(
      stages.reduce((sum, s) => sum + (completed.has(s.key) ? s.weight : 0), 0)
    )
  );

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md space-y-5">
        <div className="h-2 bg-[#f0f0f0] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#ff4f00] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="space-y-1.5">
          {stages.map((s) => {
            const done = completed.has(s.key);
            const active = s.label === currentLabel;
            return (
              <div key={s.key} className="flex items-center gap-2 text-xs">
                <span
                  className={`w-3.5 h-3.5 flex items-center justify-center border ${
                    done
                      ? "bg-[#1c1b1f] border-[#1c1b1f] text-white"
                      : active
                      ? "border-[#ff4f00] text-[#ff4f00]"
                      : "border-[#e0e0e0] text-[#c0c0c0]"
                  }`}
                >
                  {done ? (
                    <svg className="w-2 h-2" fill="none" viewBox="0 0 8 8">
                      <path
                        d="M1 4l2 2 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="square"
                      />
                    </svg>
                  ) : active ? (
                    <span className="w-1.5 h-1.5 bg-[#ff4f00] animate-pulse" />
                  ) : (
                    <span className="w-1.5 h-1.5 bg-[#e0e0e0]" />
                  )}
                </span>
                <span
                  className={`font-semibold tracking-wide ${
                    done
                      ? "text-[#4a4a4a]"
                      : active
                      ? "text-[#1c1b1f]"
                      : "text-[#c0c0c0]"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {pct < 100 && (
          <p className="text-[10px] text-[#9a9a9a] text-center font-bold tracking-widest uppercase">
            {pct}% · {currentLabel || "Loading..."}
          </p>
        )}
      </div>
    </div>
  );
}
