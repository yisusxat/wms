import { SetMetadata } from '@nestjs/common';
import { WmsRole } from './auth.types';

export const ROLES_KEY = 'wms_roles';
export const Roles = (...roles: WmsRole[]) => SetMetadata(ROLES_KEY, roles);
