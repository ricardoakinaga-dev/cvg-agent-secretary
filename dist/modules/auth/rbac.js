"use strict";
// RBAC Module - Phase 5A Enterprise
// Role-Based Access Control
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasPermission = hasPermission;
exports.hasAnyPermission = hasAnyPermission;
exports.hasAllPermissions = hasAllPermissions;
exports.getRolePermissions = getRolePermissions;
exports.isValidRole = isValidRole;
exports.getRoleLevel = getRoleLevel;
exports.canManageRole = canManageRole;
// Role definitions with their permissions
const ROLE_PERMISSIONS = {
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
/**
 * Check if a role has a specific permission
 */
function hasPermission(role, permission) {
    return ROLE_PERMISSIONS[role].includes(permission);
}
/**
 * Check if a role has any of the specified permissions
 */
function hasAnyPermission(role, permissions) {
    return permissions.some(p => hasPermission(role, p));
}
/**
 * Check if a role has all of the specified permissions
 */
function hasAllPermissions(role, permissions) {
    return permissions.every(p => hasPermission(role, p));
}
/**
 * Get all permissions for a role
 */
function getRolePermissions(role) {
    return [...ROLE_PERMISSIONS[role]];
}
/**
 * Validate that a string is a valid role
 */
function isValidRole(role) {
    return ['admin', 'manager', 'agent', 'viewer'].includes(role);
}
/**
 * Get role hierarchy level (higher = more permissions)
 */
function getRoleLevel(role) {
    const levels = {
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
function canManageRole(managerRole, targetRole) {
    return getRoleLevel(managerRole) > getRoleLevel(targetRole);
}
//# sourceMappingURL=rbac.js.map