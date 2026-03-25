// Tests for RBAC Module - Phase 5A Enterprise

import {
  Role,
  Permission,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getRolePermissions,
  isValidRole,
  getRoleLevel,
  canManageRole,
} from '../../src/modules/auth/rbac';

describe('RBAC Module', () => {
  describe('hasPermission', () => {
    it('should grant admin all permissions', () => {
      expect(hasPermission('admin', 'conversations:read')).toBe(true);
      expect(hasPermission('admin', 'users:write')).toBe(true);
      expect(hasPermission('admin', 'settings:write')).toBe(true);
    });

    it('should grant manager limited permissions', () => {
      expect(hasPermission('manager', 'conversations:read')).toBe(true);
      expect(hasPermission('manager', 'knowledge:approve')).toBe(true);
      expect(hasPermission('manager', 'settings:write')).toBe(false);
    });

    it('should grant agent basic permissions', () => {
      expect(hasPermission('agent', 'conversations:read')).toBe(true);
      expect(hasPermission('agent', 'conversations:write')).toBe(true);
      expect(hasPermission('agent', 'knowledge:publish')).toBe(false);
    });

    it('should grant viewer read-only permissions', () => {
      expect(hasPermission('viewer', 'conversations:read')).toBe(true);
      expect(hasPermission('viewer', 'knowledge:read')).toBe(true);
      expect(hasPermission('viewer', 'conversations:write')).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true if user has any of the permissions', () => {
      expect(hasAnyPermission('agent', ['conversations:write', 'users:write'])).toBe(true);
    });

    it('should return false if user has none of the permissions', () => {
      expect(hasAnyPermission('viewer', ['conversations:delete', 'users:write'])).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true if user has all permissions', () => {
      expect(hasAllPermissions('admin', ['conversations:read', 'users:write'])).toBe(true);
    });

    it('should return false if user lacks any permission', () => {
      expect(hasAllPermissions('agent', ['conversations:read', 'users:write'])).toBe(false);
    });
  });

  describe('getRolePermissions', () => {
    it('should return all permissions for admin', () => {
      const permissions = getRolePermissions('admin');
      expect(permissions.length).toBe(14);
    });

    it('should return limited permissions for viewer', () => {
      const permissions = getRolePermissions('viewer');
      expect(permissions.length).toBe(3);
    });
  });

  describe('isValidRole', () => {
    it('should validate correct roles', () => {
      expect(isValidRole('admin')).toBe(true);
      expect(isValidRole('manager')).toBe(true);
      expect(isValidRole('agent')).toBe(true);
      expect(isValidRole('viewer')).toBe(true);
    });

    it('should reject invalid roles', () => {
      expect(isValidRole('superadmin')).toBe(false);
      expect(isValidRole('')).toBe(false);
    });
  });

  describe('getRoleLevel', () => {
    it('should return correct hierarchy levels', () => {
      expect(getRoleLevel('admin')).toBe(4);
      expect(getRoleLevel('manager')).toBe(3);
      expect(getRoleLevel('agent')).toBe(2);
      expect(getRoleLevel('viewer')).toBe(1);
    });
  });

  describe('canManageRole', () => {
    it('should allow higher roles to manage lower roles', () => {
      expect(canManageRole('admin', 'manager')).toBe(true);
      expect(canManageRole('manager', 'agent')).toBe(true);
    });

    it('should not allow equal or lower roles to manage', () => {
      expect(canManageRole('agent', 'agent')).toBe(false);
      expect(canManageRole('viewer', 'admin')).toBe(false);
    });
  });
});
