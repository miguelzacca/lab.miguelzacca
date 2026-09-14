-- CreateEnum
CREATE TYPE "FormulationStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "MetadataOrigin" AS ENUM ('MANUAL', 'CALCULATED', 'AI_SUGGESTED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'REVIEWED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "RevisionSource" AS ENUM ('MANUAL', 'AI', 'IMPORT', 'RESTORE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AIInteractionStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED', 'ACCEPTED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Formulation" (
    "id" UUID NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "code" VARCHAR(80) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "shortTitle" VARCHAR(160),
    "technicalName" VARCHAR(320),
    "subtitle" VARCHAR(320),
    "description" TEXT,
    "coverImageData" TEXT,
    "coverImageMime" VARCHAR(80),
    "coverImageAlt" VARCHAR(240),
    "category" VARCHAR(120),
    "formType" VARCHAR(120),
    "presentation" VARCHAR(200),
    "route" VARCHAR(120),
    "status" "FormulationStatus" NOT NULL DEFAULT 'DRAFT',
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "documentDate" DATE,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "batchTotal" DECIMAL(20,6),
    "batchUnit" VARCHAR(32),
    "containerCount" INTEGER,
    "amountPerContainer" DECIMAL(20,6),
    "containerUnit" VARCHAR(32),
    "quantitativeMap" JSONB,
    "technicalNotes" TEXT,
    "storageNotes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "collectionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Formulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" UUID NOT NULL,
    "canonicalName" VARCHAR(240) NOT NULL,
    "technicalName" VARCHAR(320),
    "pharmacopoeialDesignation" VARCHAR(320),
    "cas" VARCHAR(32),
    "molecularFormula" VARCHAR(160),
    "synonyms" TEXT[],
    "classification" VARCHAR(160),
    "commonRoles" TEXT[],
    "physicalForm" VARCHAR(120),
    "grade" VARCHAR(120),
    "micronization" VARCHAR(120),
    "notes" TEXT,
    "source" TEXT,
    "metadataOrigin" "MetadataOrigin" NOT NULL DEFAULT 'MANUAL',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormulationIngredient" (
    "id" UUID NOT NULL,
    "formulationId" UUID NOT NULL,
    "ingredientId" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "commonName" VARCHAR(240) NOT NULL,
    "technicalName" VARCHAR(320),
    "pharmacopoeialDesignation" VARCHAR(320),
    "cas" VARCHAR(32),
    "molecularFormula" VARCHAR(160),
    "synonyms" TEXT[],
    "role" VARCHAR(160),
    "physicalForm" VARCHAR(120),
    "grade" VARCHAR(120),
    "micronization" VARCHAR(120),
    "percentageWW" DECIMAL(12,6),
    "batchQuantity" DECIMAL(20,6),
    "batchUnit" VARCHAR(32),
    "unitQuantity" DECIMAL(20,6),
    "unitQuantityUnit" VARCHAR(32),
    "notes" TEXT,
    "source" TEXT,
    "metadataOrigin" "MetadataOrigin" NOT NULL DEFAULT 'MANUAL',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormulationIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "color" VARCHAR(32),
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "normalizedName" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormulationTag" (
    "formulationId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "FormulationTag_pkey" PRIMARY KEY ("formulationId","tagId")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" UUID NOT NULL,
    "formulationId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "source" "RevisionSource" NOT NULL DEFAULT 'MANUAL',
    "modifiedFields" TEXT[],
    "previousValues" JSONB NOT NULL,
    "snapshot" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" UUID NOT NULL,
    "formulationId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" VARCHAR(500) NOT NULL,
    "locator" VARCHAR(320),
    "url" VARCHAR(2048),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityControlRecord" (
    "id" UUID NOT NULL,
    "formulationId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "metric" VARCHAR(200) NOT NULL,
    "operator" VARCHAR(32),
    "targetValue" VARCHAR(160),
    "unit" VARCHAR(48),
    "samplingPlan" TEXT,
    "notes" TEXT,
    "status" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityControlRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessMetadata" (
    "id" UUID NOT NULL,
    "formulationId" UUID NOT NULL,
    "stageOrder" INTEGER NOT NULL DEFAULT 0,
    "stageTitle" VARCHAR(240) NOT NULL,
    "equipment" VARCHAR(240),
    "parameterName" VARCHAR(160),
    "parameterValue" VARCHAR(240),
    "parameterUnit" VARCHAR(48),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelingField" (
    "id" UUID NOT NULL,
    "formulationId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "label" VARCHAR(160) NOT NULL,
    "value" TEXT,
    "include" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelingField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Packaging" (
    "id" UUID NOT NULL,
    "formulationId" UUID NOT NULL,
    "containerType" VARCHAR(160),
    "containerMaterial" VARCHAR(160),
    "containerCount" INTEGER,
    "netContent" VARCHAR(160),
    "closureType" VARCHAR(200),
    "sealType" VARCHAR(200),
    "flowControl" VARCHAR(200),
    "moistureProtection" VARCHAR(200),
    "lightProtection" VARCHAR(200),
    "packagingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Packaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSettings" (
    "id" UUID NOT NULL,
    "formulationId" UUID NOT NULL,
    "language" VARCHAR(16) NOT NULL DEFAULT 'pt-BR',
    "pageSize" VARCHAR(16) NOT NULL DEFAULT 'A4',
    "density" VARCHAR(24) NOT NULL DEFAULT 'STANDARD',
    "showCoverImage" BOOLEAN NOT NULL DEFAULT true,
    "showProvenance" BOOLEAN NOT NULL DEFAULT false,
    "showTechnicalNotes" BOOLEAN NOT NULL DEFAULT true,
    "showCas" BOOLEAN NOT NULL DEFAULT true,
    "showSynonyms" BOOLEAN NOT NULL DEFAULT false,
    "showRevisionHistory" BOOLEAN NOT NULL DEFAULT false,
    "sectionOrder" TEXT[],
    "enabledSections" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "formulationId" UUID NOT NULL,
    "filename" VARCHAR(500) NOT NULL,
    "mimeType" VARCHAR(160) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" VARCHAR(1024) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "key" VARCHAR(160) NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AIInteraction" (
    "id" UUID NOT NULL,
    "formulationId" UUID,
    "action" VARCHAR(120) NOT NULL,
    "inputSummary" JSONB,
    "proposal" JSONB,
    "acceptedFields" TEXT[],
    "model" VARCHAR(240),
    "status" "AIInteractionStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Formulation_code_key" ON "Formulation"("code");

-- CreateIndex
CREATE INDEX "Formulation_updatedAt_idx" ON "Formulation"("updatedAt");

-- CreateIndex
CREATE INDEX "Formulation_status_archivedAt_idx" ON "Formulation"("status", "archivedAt");

-- CreateIndex
CREATE INDEX "Formulation_favorite_idx" ON "Formulation"("favorite");

-- CreateIndex
CREATE INDEX "Formulation_collectionId_idx" ON "Formulation"("collectionId");

-- CreateIndex
CREATE INDEX "Formulation_title_idx" ON "Formulation"("title");

-- CreateIndex
CREATE INDEX "Formulation_technicalName_idx" ON "Formulation"("technicalName");

-- CreateIndex
CREATE INDEX "Ingredient_canonicalName_idx" ON "Ingredient"("canonicalName");

-- CreateIndex
CREATE INDEX "Ingredient_technicalName_idx" ON "Ingredient"("technicalName");

-- CreateIndex
CREATE INDEX "Ingredient_cas_idx" ON "Ingredient"("cas");

-- CreateIndex
CREATE INDEX "FormulationIngredient_formulationId_idx" ON "FormulationIngredient"("formulationId");

-- CreateIndex
CREATE INDEX "FormulationIngredient_ingredientId_idx" ON "FormulationIngredient"("ingredientId");

-- CreateIndex
CREATE INDEX "FormulationIngredient_cas_idx" ON "FormulationIngredient"("cas");

-- CreateIndex
CREATE UNIQUE INDEX "FormulationIngredient_formulationId_position_key" ON "FormulationIngredient"("formulationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_name_key" ON "Collection"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_normalizedName_key" ON "Tag"("normalizedName");

-- CreateIndex
CREATE INDEX "FormulationTag_tagId_idx" ON "FormulationTag"("tagId");

-- CreateIndex
CREATE INDEX "Revision_formulationId_createdAt_idx" ON "Revision"("formulationId", "createdAt");

-- CreateIndex
CREATE INDEX "Reference_formulationId_position_idx" ON "Reference"("formulationId", "position");

-- CreateIndex
CREATE INDEX "QualityControlRecord_formulationId_position_idx" ON "QualityControlRecord"("formulationId", "position");

-- CreateIndex
CREATE INDEX "QualityControlRecord_metric_idx" ON "QualityControlRecord"("metric");

-- CreateIndex
CREATE INDEX "ProcessMetadata_formulationId_stageOrder_idx" ON "ProcessMetadata"("formulationId", "stageOrder");

-- CreateIndex
CREATE INDEX "LabelingField_formulationId_position_idx" ON "LabelingField"("formulationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Packaging_formulationId_key" ON "Packaging"("formulationId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSettings_formulationId_key" ON "DocumentSettings"("formulationId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_formulationId_idx" ON "Attachment"("formulationId");

-- CreateIndex
CREATE INDEX "AIInteraction_formulationId_createdAt_idx" ON "AIInteraction"("formulationId", "createdAt");

-- CreateIndex
CREATE INDEX "AIInteraction_status_idx" ON "AIInteraction"("status");

-- AddForeignKey
ALTER TABLE "Formulation" ADD CONSTRAINT "Formulation_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulationIngredient" ADD CONSTRAINT "FormulationIngredient_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulationIngredient" ADD CONSTRAINT "FormulationIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulationTag" ADD CONSTRAINT "FormulationTag_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulationTag" ADD CONSTRAINT "FormulationTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityControlRecord" ADD CONSTRAINT "QualityControlRecord_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessMetadata" ADD CONSTRAINT "ProcessMetadata_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelingField" ADD CONSTRAINT "LabelingField_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packaging" ADD CONSTRAINT "Packaging_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSettings" ADD CONSTRAINT "DocumentSettings_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInteraction" ADD CONSTRAINT "AIInteraction_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
