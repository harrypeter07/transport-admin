export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
 try {
 const session = await verifySession();
 const { searchParams } = new URL(req.url);
 
 const unreadOnly = searchParams.get("unread") === "true";
 const category = searchParams.get("category");

 const where: any = { userId: session.userId };
 if (unreadOnly) where.read = false;
 if (category) where.category = category;

 const notifications = await prisma.notification.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: 50 // limit to 50 for now
 });

 return NextResponse.json({ notifications });
 } catch (error: any) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }
}

export async function PATCH(req: Request) {
 try {
 const session = await verifySession();
 const { id, action } = await req.json();

 if (action === "MARK_ALL_READ") {
 await prisma.notification.updateMany({
 where: { userId: session.userId, read: false },
 data: { read: true }
 });
 return NextResponse.json({ success: true });
 }

 if (action === "MARK_READ" && id) {
 await prisma.notification.updateMany({
 where: { id, userId: session.userId },
 data: { read: true }
 });
 return NextResponse.json({ success: true });
 }

 return NextResponse.json({ error: "Invalid action" }, { status: 400 });
 } catch (error: any) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }
}
