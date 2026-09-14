import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local" });

const migrationUrl =
  process.env.PRISMA_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: migrationUrl
  }
});
