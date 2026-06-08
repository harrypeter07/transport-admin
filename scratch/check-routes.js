const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
    const routes = await prisma.route.groupBy({
        by: ['status'],
        _count: {
            id: true,
        },
    });
    console.log(routes);
}
main().finally(() => prisma.$disconnect());
