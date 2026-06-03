import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";

export async function GET(req: Request) {
 const session = await verifySession();
 if (session.role !== "ADMIN" && session.role !== "MANAGER") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const { searchParams } = new URL(req.url);
 const search = searchParams.get("search") || "";
 const role = searchParams.get("role") || "";

 try {
 const users = await prisma.user.findMany({
 where: {
 ...(search && {
 OR: [
 { name: { contains: search, mode: "insensitive" } },
 { email: { contains: search, mode: "insensitive" } },
 ],
 }),
 ...(role && { role }),
 },
 select: {
 id: true,
 name: true,
 email: true,
 role: true,
 isActive: true,
 requiresPasswordChange: true,
 },
 orderBy: { name: "asc" },
 });
 return NextResponse.json(users);
 } catch (error: any) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }
}

export async function PATCH(req: Request) {
 const session = await verifySession();
 if (session.role !== "ADMIN" && session.role !== "MANAGER") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
 const body = await req.json();
 const { id, action } = body;

 if (!id || !action) {
 return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
 }

 if (action === "DISABLE") {
 await prisma.user.update({ where: { id }, data: { isActive: false } });
 return NextResponse.json({ success: true, message: "User disabled" });
 } 
 
 if (action === "ENABLE") {
 await prisma.user.update({ where: { id }, data: { isActive: true } });
 return NextResponse.json({ success: true, message: "User enabled" });
 }

 if (action === "RESET_PASSWORD") {
 const defaultPassword = await bcrypt.hash("Welcome@123", 10);
 await prisma.user.update({
 where: { id },
 data: {
 password: defaultPassword,
 requiresPasswordChange: true,
 resetToken: null,
 resetTokenExpiry: null,
 },
 });
 return NextResponse.json({ success: true, message: "Password reset to default (Welcome@123)" });
 }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
  return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await verifySession();
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    }

    await prisma.employee.updateMany({
      where: { userId: id },
      data: { userId: null },
    });

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "User deleted permanently" });
  } catch (error: any) {
    if (error.code === "P2003") {
      return NextResponse.json({
        error: "Cannot delete user — linked to existing records (leaves, cabs, etc.). Remove those first."
      }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
