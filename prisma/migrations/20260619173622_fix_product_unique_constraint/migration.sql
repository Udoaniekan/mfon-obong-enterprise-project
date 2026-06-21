/*
  Warnings:

  - A unique constraint covering the columns `[name,branchId]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Product_categoryId_unit_branchId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_branchId_key" ON "Product"("name", "branchId");
