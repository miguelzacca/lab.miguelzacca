import { config } from "dotenv";
config({ path: ".env.local" });
const { getPrisma } = await import("../src/server/db/prisma.js");
const prisma = getPrisma();
const code = "MZ-VERIFY-" + Date.now();
try {
  const created = await prisma.formulation.create({
    data: {
      code,
      title: "Database verification record",
      description: "Harmless transient record created by the Lab verification script."
    },
    select: { id: true, code: true }
  });
  const readBack = await prisma.formulation.findUnique({ where: { id: created.id }, select: { code: true } });
  if (readBack?.code !== code) throw new Error("Read-back verification failed.");
  await prisma.formulation.delete({ where: { id: created.id } });
  console.log(JSON.stringify({ connected: true, write: true, read: true, cleanup: true }, null, 2));
} finally {
  await prisma.$disconnect();
}
