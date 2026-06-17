import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const doc = await prisma.driverDocument.findUnique({
      where: { id },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc.fileUrl.startsWith("data:")) {
      const parts = doc.fileUrl.split(",");
      const mimeType = parts[0].match(/:(.*?);/)?.[1] || "application/octet-stream";
      const base64Data = parts[1];
      const buffer = Buffer.from(base64Data, "base64");

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `inline; filename="${doc.type.toLowerCase()}-${doc.id}"`,
          "Cache-Control": "public, max-age=31536000",
        },
      });
    }

    // If it's a URL (Supabase or public fallback), redirect to it
    const redirectUrl = doc.fileUrl.startsWith("http")
      ? doc.fileUrl
      : new URL(doc.fileUrl, req.url).toString();

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("[api] ❌ GET /api/driver/documents/view", error);
    return NextResponse.json({ error: "Failed to view document" }, { status: 500 });
  }
}
