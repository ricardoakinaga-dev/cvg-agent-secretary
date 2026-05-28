// RBAC Module - Phase 5A Enterprise
// Role-Based Access Control

export type Role = 'admin' | 'manager' | 'agent' | 'viewer';

export type Permission =
  | 'conversations:read'
  | 'conversations:write'
  | 'conversations:delete'
  | 'knowledge:read'
  | 'knowledge:write'
  | 'knowledge:publish'
  | 'knowledge:approve'
  | 'scheduling:read'
  | 'scheduling:write'
  | 'analytics:read'
  | 'analytics:export'
  | 'audit:read'
  | 'users:read'
  | 'users:write'
  | 'settings:read'
  | 'settings:write';

// Role definitions with their permissions
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'conversations:read',
    'conversations:write',
    'conversations:delete',
    'knowledge:read',
    'knowledge:write',
    'knowledge:publish',
    'knowledge:approve',
    'scheduling:read',
    'scheduling:write',
    'analytics:read',
    'analytics:export',
    'audit:read',
    'users:read',
    'users:write',
    'settings:read',
    'settings:write',
  ],
  manager: [
    'conversations:read',
    'conversations:write',
    'knowledge:read',
    'knowledge:write',
    'knowledge:publish',
    'knowledge:approve',
    'scheduling:read',
    'scheduling:write',
    'analytics:read',
    'analytics:export',
    'audit:read',
    'users:read',
    'settings:read',
  ],
  agent: [
    'conversations:read',
    'conversations:write',
    'knowledge:read',
    'knowledge:write',
    'scheduling:read',
    'scheduling:write',
    'analytics:read',
  ],
  viewer: [
    'conversations:read',
    'knowledge:read',
    'scheduling:read',
    'analytics:read',
  ],
};

export interface UserContext {
  id: string;
  role: Role;
  email?: string;
  name?: string;
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/**
 * Validate that a string is a valid role
 */
export function isValidRole(role: string): role is Role {
  return ['admin', 'manager', 'agent', 'viewer'].includes(role);
}

/**
 * Get role hierarchy level (higher = more permissions)
 */
export function getRoleLevel(role: Role): number {
  const levels: Record<Role, number> = {
    admin: 4,
    manager: 3,
    agent: 2,
    viewer: 1,
  };
  return levels[role];
}

/**
 * Check if role A can manage role B
 */
export function canManageRole(managerRole: Role, targetRole: Role): boolean {
  return getRoleLevel(managerRole) > getRoleLevel(targetRole);
}
