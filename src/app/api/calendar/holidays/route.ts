import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await verifySession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const holidays = await prisma.holiday.findMany({
      orderBy: { date: "asc" }
    });

    return NextResponse.json(holidays);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await verifySession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { date, name, description } = body;

    if (!date || !name) {
      return NextResponse.json({ error: "Date and Name are required" }, { status: 400 });
    }

    const holiday = await prisma.holiday.create({
      data: {
        date,
        name,
        description: description || ""
      }
    });

    return NextResponse.json(holiday);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await verifySession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await prisma.holiday.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await verifySession();
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, date, name, description } = body;

    if (!id || !date || !name) {
      return NextResponse.json({ error: "ID, Date, and Name are required" }, { status: 400 });
    }

    const holiday = await prisma.holiday.update({
      where: { id },
      data: {
        date,
        name,
        description: description || ""
      }
    });

    return NextResponse.json(holiday);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
