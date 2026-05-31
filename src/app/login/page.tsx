"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";
import Link from "next/link";
import Image from "next/image";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    null
  );

  return (
    <main className="min-h-screen flex antialiased" style={{ fontFamily: "var(--font-jakarta, 'Plus Jakarta Sans', sans-serif)" }}>
      {/* Left Panel — Brand / Hero */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-[#1c1b1f] p-12 relative overflow-hidden">
        {/* Decorative orange accent bar */}
        <div className="absolute top-0 left-0 w-1 h-full bg-[#ff4f00]" />

        {/* Logo */}
        <div className="pl-4">
          <Image
            src="/logo.png"
            alt="GlobalLogic"
            width={180}
            height={50}
            className="h-10 w-auto brightness-0 invert"
          />
        </div>

        {/* Hero Text */}
        <div className="pl-4">
          <h1 className="text-5xl font-extrabold text-white leading-tight tracking-tight">
            Employee<br />
            Transportation<br />
            <span className="text-[#ff4f00]">Management</span>
          </h1>
          <p className="mt-6 text-[#9a9a9a] text-base font-medium max-w-xs leading-relaxed">
            Streamline route optimization and fleet management across the MIHAN campus.
          </p>
        </div>

        {/* Footer note */}
        <div className="pl-4">
          <p className="text-[#5a5a5a] text-xs font-medium">
            Nagpur – MIHAN Campus Operations
          </p>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white p-8 lg:p-16">
        {/* Mobile Logo */}
        <div className="lg:hidden mb-10">
          <Image
            src="/logo.png"
            alt="GlobalLogic"
            width={160}
            height={45}
            className="h-9 w-auto"
          />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[#1c1b1f] tracking-tight">Sign in</h2>
            <p className="mt-1.5 text-sm text-[#6b6b6b]">
              Access your transportation dashboard
            </p>
          </div>

          <form action={action} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-[#1c1b1f] uppercase tracking-widest mb-1.5"
              >
                Email Address
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@globallogic.com"
                className="w-full rounded-none border-0 border-b-2 border-[#e8e8e8] bg-transparent px-0 py-2.5 text-sm text-[#1c1b1f] placeholder:text-[#b0b0b0] focus:outline-none focus:border-[#ff4f00] transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-[#1c1b1f] uppercase tracking-widest"
                >
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs font-medium text-[#ff4f00] hover:text-[#e64500] transition-colors">
                  Forgot password?
                </Link>
              </div>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full rounded-none border-0 border-b-2 border-[#e8e8e8] bg-transparent px-0 py-2.5 text-sm text-[#1c1b1f] placeholder:text-[#b0b0b0] focus:outline-none focus:border-[#ff4f00] transition-colors"
              />
            </div>

            {/* Error */}
            {state?.error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 border-l-4 border-[#ff4f00] bg-[#fff4ef] px-3.5 py-2.5"
              >
                <svg className="w-4 h-4 text-[#ff4f00] flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-semibold text-[#c43a00]">{state.error}</span>
              </div>
            )}

            {/* Submit */}
            <div className="pt-2">
              <button
                id="login-submit"
                type="submit"
                disabled={pending}
                className="w-full flex items-center justify-center gap-2 bg-[#ff4f00] hover:bg-[#e64500] active:bg-[#cc3d00] disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 text-sm font-bold text-white transition-colors"
              >
                {pending ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin-fast" />
                    Signing in…
                  </>
                ) : (
                  "Sign in →"
                )}
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-xs text-[#9a9a9a]">
            Access is by administrator invitation only.
          </p>

          {/* TEST PHASE CREDENTIALS BOX */}
          <div className="mt-8 border border-[#e8e8e8] p-5 bg-[#f7f7f7]">
            <div className="flex items-center gap-2 mb-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full bg-[#ff4f00] opacity-60"></span>
                <span className="relative inline-flex h-2 w-2 bg-[#ff4f00]"></span>
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#1c1b1f]">UAT Test Phase Active</h3>
            </div>

            <p className="text-[11px] text-[#6b6b6b] mb-4 leading-relaxed">
              Use these credentials to explore role-based views. Password for all accounts:{" "}
              <strong className="font-mono bg-white border border-[#e8e8e8] px-1 py-0.5 text-[#1c1b1f]">Welcome@123</strong>
            </p>

            <div className="space-y-1.5">
              {[
                { role: "ADMIN", email: "admin@transitadmin.com" },
                { role: "MANAGER", email: "manager_test@transitadmin.com" },
                { role: "EMPLOYEE", email: "employee_test@transitadmin.com" },
                { role: "DRIVER", email: "driver_test@transitadmin.com" },
              ].map(({ role, email }) => (
                <div key={role} className="flex justify-between items-center text-[10px] bg-white border border-[#e8e8e8] px-3 py-2">
                  <span className="font-bold text-[#ff4f00] w-16">{role}</span>
                  <span className="font-mono text-[#6b6b6b] select-all">{email}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
