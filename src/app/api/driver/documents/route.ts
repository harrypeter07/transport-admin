export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "DRIVER" && session.role !== "ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let cab;
    if (session.role === "DRIVER") {
      cab = await prisma.cab.findUnique({
        where: { userId: session.userId },
        include: { documents: true },
      });
    } else {
      const { searchParams } = new URL(req.url);
      const cabId = searchParams.get("cabId");
      if (!cabId) {
        return NextResponse.json({ error: "cabId query parameter is required for admin" }, { status: 400 });
      }
      cab = await prisma.cab.findUnique({
        where: { id: cabId },
        include: { documents: true },
      });
    }

    if (!cab) {
      return NextResponse.json({ error: "Driver profile/cab not found" }, { status: 404 });
    }

    return NextResponse.json(cab.documents);
  } catch (error) {
    console.error("[api] ❌ GET /api/driver/documents", error);
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "DRIVER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cab = await prisma.cab.findUnique({
      where: { userId: session.userId },
    });

    if (!cab) {
      return NextResponse.json({ error: "Driver profile/cab not found" }, { status: 404 });
    }

    const body = await req.json();
    const { type, expiryDate: expiryDateStr } = body;

    if (!type || !expiryDateStr) {
      return NextResponse.json({ error: "type and expiryDate are required" }, { status: 400 });
    }

    const expiryDate = new Date(expiryDateStr);
    if (isNaN(expiryDate.getTime())) {
      return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 });
    }

    // Set next audit date to 3 months from now (90 days)
    const auditDate = new Date();
    auditDate.setDate(auditDate.getDate() + 90);

    const doc = await prisma.driverDocument.upsert({
      where: {
        cabId_type: {
          cabId: cab.id,
          type,
        },
      },
      update: {
        expiryDate,
        auditDate,
      },
      create: {
        cabId: cab.id,
        type,
        fileUrl: "", // fileUrl would be empty if created without file
        expiryDate,
        auditDate,
      },
    });

    return NextResponse.json({
      success: true,
      document: doc,
    });
  } catch (error) {
    console.error("[api] ❌ POST /api/driver/documents", error);
    return NextResponse.json({ error: "Failed to update document" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "ADMIN" && session.role !== "DRIVER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const docId = searchParams.get("id");
    if (!docId) {
      return NextResponse.json({ error: "Document ID is required" }, { status: 400 });
    }

    if (session.role === "DRIVER") {
      const cab = await prisma.cab.findUnique({
        where: { userId: session.userId },
      });
      if (!cab) {
        return NextResponse.json({ error: "Cab profile not found" }, { status: 404 });
      }
      const doc = await prisma.driverDocument.findUnique({
        where: { id: docId }
      });
      if (!doc || doc.cabId !== cab.id) {
        return NextResponse.json({ error: "Unauthorized to delete this document" }, { status: 401 });
      }
    }

    await prisma.driverDocument.delete({
      where: { id: docId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api] ❌ DELETE /api/driver/documents", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
