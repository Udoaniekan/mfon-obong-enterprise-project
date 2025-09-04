import { SetMetadata } from '@nestjs/common';

export const BYPASS_SESSION_MANAGEMENT_KEY = 'bypassSessionManagement';
export const BypassSessionManagement = () => SetMetadata(BYPASS_SESSION_MANAGEMENT_KEY, true);