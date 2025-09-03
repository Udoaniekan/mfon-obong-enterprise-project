import { SetMetadata } from '@nestjs/common';

export const BYPASS_MAINTENANCE_KEY = 'bypassMaintenance';
export const BypassMaintenance = () => SetMetadata(BYPASS_MAINTENANCE_KEY, true);