import { getPrisma } from "../db/prisma.js";

function serialize(profile, usageCount = 0) {
  return { ...profile, usageCount };
}

export class PrismaIngredientRepository {
  constructor(prisma = getPrisma()) { this.prisma = prisma; }
  async list() {
    const rows = await this.prisma.ingredient.findMany({
      include: { _count: { select: { formulations: true } } },
      orderBy: { canonicalName: "asc" }
    });
    return rows.map((row) => {
      const count = row._count.formulations;
      delete row._count;
      return serialize(row, count);
    });
  }
  async save(input) {
    if (!input?.canonicalName?.trim()) throw Object.assign(new Error("INVALID"), { status: 400 });
    const data = {
      canonicalName: String(input.canonicalName).trim().slice(0, 240),
      technicalName: input.technicalName?.trim().slice(0, 320) || null,
      pharmacopoeialDesignation: input.pharmacopoeialDesignation?.trim().slice(0, 320) || null,
      cas: input.cas?.trim().slice(0, 32) || null,
      molecularFormula: input.molecularFormula?.trim().slice(0, 160) || null,
      synonyms: Array.isArray(input.synonyms) ? input.synonyms.map(String).filter(Boolean).slice(0, 40) : [],
      classification: input.classification?.trim().slice(0, 160) || null,
      commonRoles: Array.isArray(input.commonRoles) ? input.commonRoles.map(String).filter(Boolean).slice(0, 40) : [],
      physicalForm: input.physicalForm?.trim().slice(0, 120) || null,
      grade: input.grade?.trim().slice(0, 120) || null,
      micronization: input.micronization?.trim().slice(0, 120) || null,
      notes: input.notes?.trim().slice(0, 10000) || null,
      source: input.source?.trim().slice(0, 2000) || null,
      metadataOrigin: ["MANUAL", "CALCULATED", "AI_SUGGESTED", "VERIFIED"].includes(input.metadataOrigin) ? input.metadataOrigin : "MANUAL",
      verificationStatus: ["UNVERIFIED", "REVIEWED", "VERIFIED"].includes(input.verificationStatus) ? input.verificationStatus : "UNVERIFIED"
    };
    return input.id
      ? this.prisma.ingredient.update({ where: { id: input.id }, data })
      : this.prisma.ingredient.create({ data });
  }
}
