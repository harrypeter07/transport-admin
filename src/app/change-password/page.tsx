"use client";

import { useActionState } from "react";
import { changePassword, type ChangePasswordState } from "@/app/actions/auth";

export default function ChangePasswordPage() {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(
    changePassword,
    null
  );

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f7f7f7] p-4 font-sans antialiased">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1c1b1f] mb-5">
            <span className="text-white font-black text-lg tracking-tighter select-none">TA</span>
          </div>
          <h1 className="text-2xl font-extrabold text-[#1c1b1f] tracking-tight">Set Your Password</h1>
          <p className="mt-1.5 text-sm text-[#6b6b6b]">
            For security reasons, you must change your temporary password before accessing the system.
          </p>
        </div>

        <div className="bg-white border border-[#e8e8e8] rounded-xl shadow-xs p-7">
          <form action={action} className="space-y-5">
            <div>
              <label
                htmlFor="new-password"
                className="block text-xs font-black text-[#4a4a4a] uppercase tracking-widest mb-1.5"
              >
                New Password
              </label>
              <input
                id="new-password"
                name="newPassword"
                type="password"
                required
                placeholder="••••••••"
                className="w-full rounded-lg border border-[#e8e8e8] bg-[#f7f7f7] px-3.5 py-2.5 text-sm text-[#1c1b1f] placeholder:text-[#9a9a9a] focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-[#ff4f00] focus:bg-white transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-xs font-black text-[#4a4a4a] uppercase tracking-widest mb-1.5"
              >
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                required
                placeholder="••••••••"
                className="w-full rounded-lg border border-[#e8e8e8] bg-[#f7f7f7] px-3.5 py-2.5 text-sm text-[#1c1b1f] placeholder:text-[#9a9a9a] focus:outline-none focus:ring-2 focus:ring-[#ff4f00]/20 focus:border-[#ff4f00] focus:bg-white transition-all"
              />
            </div>

            {state?.error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5"
              >
                <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-semibold text-red-700">{state.error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1c1b1f] hover:bg-black active:bg-black disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-bold text-white transition-all"
            >
              {pending ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin-fast" />
                  Updating…
                </>
              ) : (
                "Save & Continue"
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
