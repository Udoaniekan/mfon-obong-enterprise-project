import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../../decorators/roles.decorators';
import { UserRole } from '../../../common/enums';
import { StockReconciliationService, ReconciliationReport, StockDiscrepancy } from '../../../common/services/stock-reconciliation.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(
    private readonly stockReconciliationService: StockReconciliationService,
  ) {}

  /**
   * Perform stock reconciliation
   * Only accessible by SUPER_ADMIN and MAINTAINER
   */
  @Post('reconciliation')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  @HttpCode(HttpStatus.OK)
  async performReconciliation(
    @Query('branchId') branchId?: string,
  ): Promise<ReconciliationReport> {
    return this.stockReconciliationService.performReconciliation(branchId);
  }

  /**
   * Auto-correct stock discrepancies
   * Only accessible by SUPER_ADMIN
   */
  @Post('reconciliation/auto-correct')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async autoCorrectDiscrepancies(
    @Body() body: { discrepancies: StockDiscrepancy[]; reason?: string },
  ): Promise<{ message: string }> {
    await this.stockReconciliationService.autoCorrectDiscrepancies(
      body.discrepancies,
      body.reason || 'Manual stock correction via admin panel',
    );
    
    return { 
      message: `Successfully corrected ${body.discrepancies.length} stock discrepancies` 
    };
  }

  /**
   * Get low stock alerts
   */
  @Get('low-stock')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER, UserRole.ADMIN)
  async getLowStockAlert(@Query('branchId') branchId?: string) {
    return this.stockReconciliationService.getLowStockAlert(branchId);
  }

  /**
   * Get zero stock products
   */
  @Get('zero-stock')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER, UserRole.ADMIN)
  async getZeroStockProducts(@Query('branchId') branchId?: string) {
    return this.stockReconciliationService.getZeroStockProducts(branchId);
  }

  /**
   * Generate comprehensive inventory report
   */
  @Get('report')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER, UserRole.ADMIN)
  async generateInventoryReport(@Query('branchId') branchId?: string) {
    return this.stockReconciliationService.generateInventoryReport(branchId);
  }
}