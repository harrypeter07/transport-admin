"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { createSession, deleteSession, getSession } from "@/lib/session";

// ----- Types -----

export type LoginState = {
 error?: string;
} | null;

// ----- Login -----

export async function login(
 _prev: LoginState,
 formData: FormData
): Promise<LoginState> {
 const email = formData.get("email") as string;
 const password = formData.get("password") as string;

 if (!email || !password) {
 return { error: "Email and password are required." };
 }

 // 1. Find the user
 const user = await prisma.user.findUnique({ where: { email } });
 if (!user) {
 return { error: "Invalid email or password." };
 }

 // 2. Check if user is active
 if (!user.isActive) {
 return { error: "Account disabled. Please contact administrator." };
 }

 // 3. Verify password
 const passwordMatch = await bcrypt.compare(password, user.password);
 if (!passwordMatch) {
 return { error: "Invalid email or password." };
 }

 // 4. Create session cookie
 await createSession({
 userId: user.id,
 email: user.email,
 role: user.role,
 name: user.name,
 requiresPasswordChange: user.requiresPasswordChange,
 expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
 });

 // 5. Redirect based on password requirement
 if (user.requiresPasswordChange) {
 redirect("/change-password");
 }
 redirect("/dashboard");
}

// ----- Logout -----

export async function logout(): Promise<void> {
 await deleteSession();
 redirect("/login");
}

// ----- Change Password -----

export type ChangePasswordState = {
 error?: string;
} | null;

export async function changePassword(
 _prev: ChangePasswordState,
 formData: FormData
): Promise<ChangePasswordState> {
 const session = await getSession();
 if (!session?.userId) {
 return { error: "Not authenticated" };
 }

 const newPassword = formData.get("newPassword") as string;
 const confirmPassword = formData.get("confirmPassword") as string;

 if (!newPassword || newPassword.length < 8) {
 return { error: "Password must be at least 8 characters long." };
 }
 if (newPassword !== confirmPassword) {
 return { error: "Passwords do not match." };
 }

 const hashedPassword = await bcrypt.hash(newPassword, 10);

 await prisma.user.update({
 where: { id: session.userId },
 data: {
 password: hashedPassword,
 requiresPasswordChange: false,
 },
 });

 // Re-create session to remove requiresPasswordChange flag
 await createSession({
 userId: session.userId,
 email: session.email,
 role: session.role,
 name: session.name,
 requiresPasswordChange: false,
 expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
 });

 redirect("/dashboard");
}

// ----- Forgot Password -----

export type ForgotPasswordState = {
 success?: boolean;
 error?: string;
} | null;

export async function forgotPassword(
 _prev: ForgotPasswordState,
 formData: FormData
): Promise<ForgotPasswordState> {
 const email = formData.get("email") as string;
 if (!email) return { error: "Email is required" };

 const user = await prisma.user.findUnique({ where: { email } });
 if (!user || !user.isActive) {
 // Return success anyway to prevent email enumeration
 return { success: true };
 }

 // Generate a random token
 const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
 
 // Set expiry to 1 hour from now
 const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

 await prisma.user.update({
 where: { id: user.id },
 data: {
 resetToken: token,
 resetTokenExpiry: expiresAt,
 },
 });

 // In a real application, send this token via email here.
 // Example: await sendEmail(email, `Your reset link: /reset-password?token=${token}`);
 console.log(`[DEV] Password reset link for ${email}: http://localhost:3000/reset-password?token=${token}`);

 return { success: true };
}

// ----- Reset Password -----

export type ResetPasswordState = {
 success?: boolean;
 error?: string;
} | null;

export async function resetPassword(
 _prev: ResetPasswordState,
 formData: FormData
): Promise<ResetPasswordState> {
 const token = formData.get("token") as string;
 const newPassword = formData.get("newPassword") as string;
 const confirmPassword = formData.get("confirmPassword") as string;

 if (!token) return { error: "Invalid token" };
 if (!newPassword || newPassword.length < 8) {
 return { error: "Password must be at least 8 characters long." };
 }
 if (newPassword !== confirmPassword) {
 return { error: "Passwords do not match." };
 }

 const user = await prisma.user.findFirst({
 where: {
 resetToken: token,
 resetTokenExpiry: {
 gt: new Date(),
 },
 },
 });

 if (!user) {
 return { error: "Invalid or expired reset token. Please request a new one." };
 }

 const hashedPassword = await bcrypt.hash(newPassword, 10);

 await prisma.user.update({
 where: { id: user.id },
 data: {
 password: hashedPassword,
 requiresPasswordChange: false,
 resetToken: null,
 resetTokenExpiry: null,
 },
 });

 return { success: true };
}
