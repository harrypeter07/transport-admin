"use client";

import { useActionState } from "react";
import { forgotPassword, type ForgotPasswordState } from "@/app/actions/auth";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ForgotPasswordState, FormData>(
    forgotPassword,
    null
  );

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f7f7f7] p-4 font-sans antialiased">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1c1b1f] mb-5">
            <span className="text-white font-black text-lg tracking-tighter select-none">TA</span>
          </div>
          <h1 className="text-2xl font-extrabold text-[#1c1b1f] tracking-tight">Reset Password</h1>
          <p className="mt-1.5 text-sm text-[#6b6b6b]">
            Enter your email to receive a password reset link.
          </p>
        </div>

        <div className="bg-white border border-[#e8e8e8] rounded-xl shadow-xs p-7">
          {state?.success ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mb-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-[#1c1b1f]">Check your email</h2>
              <p className="text-sm text-[#6b6b6b]">
                If an account exists for that email, we have sent a reset link.
              </p>
              <Link href="/login" className="block w-full py-2.5 text-sm font-bold text-[#1c1b1f] border border-[#e8e8e8] rounded-lg hover:bg-[#f7f7f7] transition-all mt-4">
                Return to Login
              </Link>
            </div>
          ) : (
            <form action={action} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-black text-[#4a4a4a] uppercase tracking-widest mb-1.5"
                >
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="name@corporate.com"
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
                    Sending…
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </button>
              
              <div className="text-center mt-4">
                <Link href="/login" className="text-xs font-semibold text-[#6b6b6b] hover:text-[#1c1b1f] transition-colors">
                  Back to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
