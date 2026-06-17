const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  try {
    const shifts = await prisma.shift.findMany({
      include: {
        _count: {
          select: { employees: true }
        }
      }
    });
    console.log("--- Shifts in Database ---");
    shifts.forEach(s => {
      console.log(`ID: "${s.id}", Name: "${s.name}", StartTime: "${s.startTime}", EndTime: "${s.endTime}", EmployeeCount: ${s._count.employees}`);
    });

    const employeesWithShifts = await prisma.employee.findMany({
      select: {
        id: true,
        name: true,
        shiftId: true,
        shift: { select: { name: true, startTime: true } }
      }
    });

    console.log("\n--- Employee Shift ID Summary ---");
    const shiftCount = {};
    employeesWithShifts.forEach(e => {
      const key = e.shiftId || "null";
      const name = e.shift?.name || "None";
      const start = e.shift?.startTime || "";
      if (!shiftCount[key]) {
        shiftCount[key] = { count: 0, name, start };
      }
      shiftCount[key].count++;
    });

    Object.entries(shiftCount).forEach(([id, data]) => {
      console.log(`ShiftID: "${id}" | Name: "${data.name}" | StartTime: "${data.start}" | Count: ${data.count}`);
    });

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
