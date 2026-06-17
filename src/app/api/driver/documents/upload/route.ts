export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "DRIVER" && session.role !== "ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const type = formData.get("type") as string;
    const expiryDateStr = formData.get("expiryDate") as string;
    const cabId = formData.get("cabId") as string;

    let cab;
    if (session.role === "DRIVER") {
      cab = await prisma.cab.findUnique({
        where: { userId: session.userId },
      });
    } else {
      if (!cabId) {
        return NextResponse.json({ error: "cabId is required for admins" }, { status: 400 });
      }
      cab = await prisma.cab.findUnique({
        where: { id: cabId },
      });
    }

    if (!cab) {
      return NextResponse.json({ error: "Driver profile/cab not found" }, { status: 404 });
    }

    if (!file || !type || !expiryDateStr) {
      return NextResponse.json({ error: "Missing required fields: file, type, expiryDate" }, { status: 400 });
    }

    const expiryDate = new Date(expiryDateStr);
    if (isNaN(expiryDate.getTime())) {
      return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let fileUrl = "";
    let uploadedToSupabase = false;

    const ext = path.extname(file.name) || ".pdf";
    const filename = `${cab.id}-${type.toLowerCase()}-${Date.now()}${ext}`;

    // Try uploading to Supabase bucket if configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const bucket = "driver-documents";
        const cleanSupabaseUrl = supabaseUrl.replace(/\/$/, "");
        const uploadUrl = `${cleanSupabaseUrl}/storage/v1/object/${bucket}/${filename}`;

        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "apikey": supabaseKey,
            "Content-Type": file.type || "application/octet-stream",
          },
          body: buffer,
        });

        if (uploadRes.ok) {
          fileUrl = `${cleanSupabaseUrl}/storage/v1/object/public/${bucket}/${filename}`;
          uploadedToSupabase = true;
          console.log(`[SUPABASE_UPLOAD] Successfully uploaded ${filename} to Supabase bucket.`);
        } else {
          const errMsg = await uploadRes.text();
          console.warn(`[SUPABASE_UPLOAD] Failed, status ${uploadRes.status}, fallback to local. Details: ${errMsg}`);
        }
      } catch (err) {
        console.error("[SUPABASE_UPLOAD] Exception encountered, fallback to local:", err);
      }
    }

    // Fallback to database base64 storage if Supabase upload failed/not configured
    if (!uploadedToSupabase) {
      try {
        const base64Data = buffer.toString("base64");
        const mimeType = file.type || "application/octet-stream";
        fileUrl = `data:${mimeType};base64,${base64Data}`;
        console.log(`[DATABASE_UPLOAD] Successfully generated base64 Data URL for ${filename}.`);
      } catch (dbErr) {
        console.error("[DATABASE_UPLOAD] Failed to generate base64:", dbErr);
        return NextResponse.json({
          error: "Failed to upload document. Base64 encoding failed."
        }, { status: 500 });
      }
    }

    // Next Audit Date: 3 months from now (90 days)
    const auditDate = new Date();
    auditDate.setDate(auditDate.getDate() + 90);

    // Upsert into DriverDocument
    const doc = await prisma.driverDocument.upsert({
      where: {
        cabId_type: {
          cabId: cab.id,
          type,
        },
      },
      update: {
        fileUrl,
        expiryDate,
        auditDate,
      },
      create: {
        cabId: cab.id,
        type,
        fileUrl,
        expiryDate,
        auditDate,
      },
    });

    return NextResponse.json({
      success: true,
      document: doc,
    });
  } catch (error) {
    console.error("[api] ❌ POST /api/driver/documents/upload", error);
    return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
  }
}
