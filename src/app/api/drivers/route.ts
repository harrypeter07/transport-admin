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
  const shiftId = searchParams.get("shiftId");

  try {
    const drivers = await prisma.driver.findMany({
      where: {
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { vendor: { contains: search, mode: "insensitive" } },
          ],
        }),
        ...(shiftId && { shiftId }),
      },
      include: {
        shift: true,
        cab: true,
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(drivers);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await verifySession();
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, phone, licenseNumber, vendor, status, shiftId } = body;

    const defaultPassword = await bcrypt.hash("Welcome@123", 10);
    // Generate an email based on name/phone for the driver login since they don't have corporate emails
    const driverEmail = `driver.${phone}@corporate.com`;

    const newDriver = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email: driverEmail } });
      if (!user) {
        user = await tx.user.create({
          data: {
            email: driverEmail,
            password: defaultPassword,
            name,
            role: "DRIVER",
            requiresPasswordChange: true,
          }
        });
      }

      return await tx.driver.create({
        data: { name, phone, licenseNumber, vendor, status, shiftId, userId: user.id },
        include: { shift: true }
      });
    });
    
    return NextResponse.json(newDriver);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
