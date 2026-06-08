export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/dal";
import prisma from "@/lib/db";

export async function GET() {
 const session = await verifySession();
 if (session.role !== "ADMIN" && session.role !== "MANAGER") {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
  const [
  totalEmployees,
  totalCabs,
  totalRoutes,
  employeesByDesignation,
  employeesByShift,
  activeCabs
  ] = await Promise.all([
  prisma.employee.count({ where: { status: "ACTIVE" } }),
  prisma.cab.count({ where: { status: { not: "INACTIVE" } } }),
  prisma.route.count(),
  prisma.employee.groupBy({
  by: ['designation'],
  where: { status: "ACTIVE" },
  _count: { id: true }
  }),
  prisma.employee.groupBy({
  by: ['shiftId'],
  where: { status: "ACTIVE" },
  _count: { id: true }
  }),
  prisma.cab.count({ where: { status: 'ACTIVE' } }),
  ]);

 // Fetch shift names for the employeesByShift mapping
 const shifts = await prisma.shift.findMany();
 const shiftMap = shifts.reduce((acc, s) => ({ ...acc, [s.id]: s.name }), {} as Record<string, string>);

 const formattedEmployeesByShift = employeesByShift.map(item => ({
 shift: item.shiftId ? shiftMap[item.shiftId] || 'Unknown' : 'Unassigned',
 count: item._count.id
 }));

 return NextResponse.json({
 operations: {
 totalEmployees,
 totalCabs,
 totalRoutes,
 },
 workforce: {
 employeesByDesignation: employeesByDesignation.map(d => ({
 designation: d.designation || 'None',
 count: d._count.id
 })),
 employeesByShift: formattedEmployeesByShift,
 },
 fleet: {
 activeCabs,
 }
 });
 } catch (error: any) {
 return NextResponse.json({ error: error.message }, { status: 500 });
 }
}
