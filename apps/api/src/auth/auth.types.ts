export type WmsRole = 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'VIEWER';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  name?: string;
  role: WmsRole;
  permissions?: any;
}
