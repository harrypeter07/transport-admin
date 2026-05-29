import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await verifySession();
    
    let settings = await prisma.notificationSettings.findUnique({
      where: { userId: session.userId }
    });

    if (!settings) {
      settings = await prisma.notificationSettings.create({
        data: { userId: session.userId }
      });
    }

    return NextResponse.json({ settings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await verifySession();
    const body = await req.json();

    const allowedFields = ["routeNotifications", "leaveNotifications", "approvalNotifications", "systemNotifications"];
    const updateData: any = {};
    
    for (const field of allowedFields) {
      if (typeof body[field] === "boolean") {
        updateData[field] = body[field];
      }
    }

    const settings = await prisma.notificationSettings.upsert({
      where: { userId: session.userId },
      update: updateData,
      create: { userId: session.userId, ...updateData }
    });

    return NextResponse.json({ settings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
