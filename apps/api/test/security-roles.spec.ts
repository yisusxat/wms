import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '../src/auth/roles.guard';
import { ROLES_KEY } from '../src/auth/roles.decorator';
import { ReportsController } from '../src/reports/reports.controller';
import { UsersController } from '../src/users/users.controller';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUserDto } from '../src/users/dto/create-user.dto';

describe('Security & RBAC Enforcement Suite', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const createMockContext = (role: string, handler: Function, targetClass: any): ExecutionContext => {
    const request = {
      user: { id: 'usr-1', email: 'test@wms.com', role },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => handler,
      getClass: () => targetClass,
    } as unknown as ExecutionContext;
  };

  describe('ReportsController Access Control', () => {
    it('should have @Roles("ADMIN", "SUPERVISOR") configured on class', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, ReportsController);
      expect(roles).toEqual(['ADMIN', 'SUPERVISOR']);
    });

    it('should allow ADMIN to access reports endpoints', () => {
      const context = createMockContext('ADMIN', ReportsController.prototype.inventory, ReportsController);
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow SUPERVISOR to access reports endpoints', () => {
      const context = createMockContext('SUPERVISOR', ReportsController.prototype.inventory, ReportsController);
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should block OPERATOR from accessing reports endpoints with ForbiddenException', () => {
      const context = createMockContext('OPERATOR', ReportsController.prototype.inventory, ReportsController);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should block VIEWER from accessing reports endpoints with ForbiddenException', () => {
      const context = createMockContext('VIEWER', ReportsController.prototype.inventory, ReportsController);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('UsersController Access Control', () => {
    it('should block VIEWER and SUPERVISOR from administrative user management', () => {
      const contextViewer = createMockContext('VIEWER', UsersController.prototype.createUser, UsersController);
      expect(() => guard.canActivate(contextViewer)).toThrow(ForbiddenException);

      const contextSupervisor = createMockContext('SUPERVISOR', UsersController.prototype.createUser, UsersController);
      expect(() => guard.canActivate(contextSupervisor)).toThrow(ForbiddenException);
    });

    it('should allow ADMIN to access user management', () => {
      const contextAdmin = createMockContext('ADMIN', UsersController.prototype.createUser, UsersController);
      expect(guard.canActivate(contextAdmin)).toBe(true);
    });
  });

  describe('Password Policy Enforcement (≥ 10 characters)', () => {
    it('should reject passwords shorter than 10 characters in CreateUserDto', async () => {
      const shortDto = plainToInstance(CreateUserDto, {
        name: 'Operario',
        email: 'op@wms.com',
        password: 'Pass1', // 5 chars
      });
      const errors = await validate(shortDto);
      expect(errors.length).toBeGreaterThan(0);
      const passwordError = errors.find((e) => e.property === 'password');
      expect(passwordError).toBeDefined();
    });

    it('should accept passwords with 10 or more characters in CreateUserDto', async () => {
      const validDto = plainToInstance(CreateUserDto, {
        name: 'Operario',
        email: 'op@wms.com',
        password: 'SecurePassword123!',
      });
      const errors = await validate(validDto);
      expect(errors.length).toBe(0);
    });
  });
});
