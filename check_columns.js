const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const routeCols = await p.$queryRaw`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'Route' AND table_schema = 'public'
    ORDER BY column_name
  `;
  console.log('\n=== Route columns ===');
  routeCols.forEach(r => console.log(' -', r.column_name));

  const empCols = await p.$queryRaw`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'Employee' AND table_schema = 'public'
    ORDER BY column_name
  `;
  console.log('\n=== Employee columns ===');
  empCols.forEach(r => console.log(' -', r.column_name));

  const tables = await p.$queryRaw`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  console.log('\n=== All tables ===');
  tables.forEach(r => console.log(' -', r.table_name));
}

main().catch(console.error).finally(() => p.$disconnect());
