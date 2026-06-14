-- CreateTable
CREATE TABLE IF NOT EXISTS "PickupPoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "zone" TEXT NOT NULL,
    "subZone" TEXT NOT NULL DEFAULT 'NE',
    "distanceRing" TEXT NOT NULL DEFAULT 'MID',
    "address" TEXT,
    "landmark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickupPoint_pkey" PRIMARY KEY ("id")
);

-- AlterTable Cab
ALTER TABLE "Cab" ADD COLUMN IF NOT EXISTS "assignedZone" TEXT;
ALTER TABLE "Cab" ADD COLUMN IF NOT EXISTS "assignedSubZone" TEXT;

-- AlterTable Employee
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "zone" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "subZone" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "distanceRing" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "distanceFromDepotKm" DOUBLE PRECISION;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "pickupPointId" TEXT;

-- AlterTable Route
ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "zone" TEXT;
ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "subZone" TEXT;
ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey (ignore if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Employee_pickupPointId_fkey'
  ) THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_pickupPointId_fkey"
      FOREIGN KEY ("pickupPointId") REFERENCES "PickupPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
