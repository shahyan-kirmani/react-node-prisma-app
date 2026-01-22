-- CreateTable
CREATE TABLE `contract` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clientId` INTEGER NOT NULL,
    `unitId` INTEGER NOT NULL,
    `totalAmount` INTEGER NOT NULL,
    `downpaymentPct` INTEGER NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `months` INTEGER NOT NULL DEFAULT 48,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `bookingDate` DATETIME(3) NULL,
    `downPayment` INTEGER NULL,
    `status` VARCHAR(191) NULL,
    `possession` INTEGER NULL,

    INDEX `Contract_clientId_fkey`(`clientId`),
    INDEX `Contract_unitId_fkey`(`unitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `installmentschedule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contractId` INTEGER NOT NULL,
    `srNo` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `installmentAmount` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InstallmentSchedule_contractId_fkey`(`contractId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ledgerrow` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `contractId` INTEGER NOT NULL,
    `srNo` INTEGER NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `installmentAmount` INTEGER NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `amountPaid` INTEGER NOT NULL DEFAULT 0,
    `paymentDate` DATETIME(3) NULL,
    `paymentProof` VARCHAR(191) NULL,
    `instrumentType` VARCHAR(191) NULL,
    `instrumentNo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ledgerrow_contractId_idx`(`contractId`),
    UNIQUE INDEX `contractId_srNo`(`contractId`, `srNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ledgerchildrow` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ledgerRowId` INTEGER NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `amountPaid` INTEGER NOT NULL DEFAULT 0,
    `paymentDate` DATETIME(3) NULL,
    `paymentProof` VARCHAR(191) NULL,
    `instrumentType` VARCHAR(191) NULL,
    `instrumentNo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ledgerChild_ledgerRowId_idx`(`ledgerRowId`),
    UNIQUE INDEX `ledgerChild_ledgerRowId_lineNo`(`ledgerRowId`, `lineNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `scheduleId` INTEGER NOT NULL,
    `paidAmount` INTEGER NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL,
    `proofUrl` VARCHAR(191) NULL,
    `referenceNo` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Payment_createdById_fkey`(`createdById`),
    INDEX `Payment_scheduleId_fkey`(`scheduleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `unit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `project` VARCHAR(191) NOT NULL,
    `unitNumber` VARCHAR(191) NOT NULL,
    `unitSize` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unitType` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('CLIENT', 'ACQUISITION') NOT NULL DEFAULT 'CLIENT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cnic` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `contract` ADD CONSTRAINT `Contract_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract` ADD CONSTRAINT `Contract_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `installmentschedule` ADD CONSTRAINT `InstallmentSchedule_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `contract`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ledgerrow` ADD CONSTRAINT `ledgerrow_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `contract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ledgerchildrow` ADD CONSTRAINT `ledgerchildrow_ledgerRowId_fkey` FOREIGN KEY (`ledgerRowId`) REFERENCES `ledgerrow`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment` ADD CONSTRAINT `Payment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment` ADD CONSTRAINT `Payment_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `installmentschedule`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
