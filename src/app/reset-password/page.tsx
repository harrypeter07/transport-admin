"use client";

import { useActionState, Suspense } from "react";
import { resetPassword, type ResetPasswordState } from "@/app/actions/auth";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(
    resetPassword,
    null
  );

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 mb-5">
          <span className="text-white font-black text-lg tracking-tighter select-none">TA</span>
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Set New Password</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Enter a new secure password for your account.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-7">
        <form action={action} className="space-y-5">
          <input type="hidden" name="token" value={token} />
          
          <div>
            <label htmlFor="new-password" className="block text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5">
              New Password
            </label>
            <input
              id="new-password"
              name="newPassword"
              type="password"
              required
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-500 focus:bg-white transition-all"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5">
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              required
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-500 focus:bg-white transition-all"
            />
          </div>

          {state?.error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              <span className="text-xs font-semibold text-red-700">{state.error}</span>
            </div>
          )}

          {state?.success ? (
            <div className="text-center pt-2">
              <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition-all w-full">
                Password Updated. Login Now
              </Link>
            </div>
          ) : (
            <button
              type="submit"
              disabled={pending || !token}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-slate-950 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-bold text-white transition-all"
            >
              {pending ? (
                <><div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin-fast" /> Updating…</>
              ) : (
                "Reset Password"
              )}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans antialiased">
      <Suspense fallback={<div className="w-8 h-8 rounded-full border-4 border-slate-900/30 border-t-slate-900 animate-spin-fast" />}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
