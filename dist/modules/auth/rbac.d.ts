export type Role = 'admin' | 'manager' | 'agent' | 'viewer';
export type Permission = 'conversations:read' | 'conversations:write' | 'conversations:delete' | 'knowledge:read' | 'knowledge:write' | 'knowledge:publish' | 'knowledge:approve' | 'scheduling:read' | 'scheduling:write' | 'analytics:read' | 'analytics:export' | 'audit:read' | 'users:read' | 'users:write' | 'settings:read' | 'settings:write';
export interface UserContext {
    id: string;
    role: Role;
    email?: string;
    name?: string;
}
/**
 * Check if a role has a specific permission
 */
export declare function hasPermission(role: Role, permission: Permission): boolean;
/**
 * Check if a role has any of the specified permissions
 */
export declare function hasAnyPermission(role: Role, permissions: Permission[]): boolean;
/**
 * Check if a role has all of the specified permissions
 */
export declare function hasAllPermissions(role: Role, permissions: Permission[]): boolean;
/**
 * Get all permissions for a role
 */
export declare function getRolePermissions(role: Role): Permission[];
/**
 * Validate that a string is a valid role
 */
export declare function isValidRole(role: string): role is Role;
/**
 * Get role hierarchy level (higher = more permissions)
 */
export declare function getRoleLevel(role: Role): number;
/**
 * Check if role A can manage role B
 */
export declare function canManageRole(managerRole: Role, targetRole: Role): boolean;
//# sourceMappingURL=rbac.d.ts.map