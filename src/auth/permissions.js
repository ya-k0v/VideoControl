/**
 * Role-based permissions system
 */

// Define roles and their hierarchical level
export const ROLES = {
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
  VIEWER: 'VIEWER'
};

// Role hierarchy (higher number = more permissions)
const ROLE_HIERARCHY = {
  [ROLES.VIEWER]: 1,
  [ROLES.OPERATOR]: 2,
  [ROLES.ADMIN]: 3
};

// Define permissions
export const PERMISSIONS = {
  // Device permissions
  DEVICE_VIEW: 'device:view',
  DEVICE_CREATE: 'device:create',
  DEVICE_UPDATE: 'device:update',
  DEVICE_DELETE: 'device:delete',
  
  // File permissions
  FILE_VIEW: 'file:view',
  FILE_UPLOAD: 'file:upload',
  FILE_DELETE: 'file:delete',
  FILE_MANAGE: 'file:manage',
  
  // Playlist permissions
  PLAYLIST_VIEW: 'playlist:view',
  PLAYLIST_CREATE: 'playlist:create',
  PLAYLIST_UPDATE: 'playlist:update',
  PLAYLIST_DELETE: 'playlist:delete',
  
  // Player control permissions
  PLAYER_CONTROL: 'player:control',
  PLAYER_STOP: 'player:stop',
  
  // System permissions
  SYSTEM_CONFIG: 'system:config',
  USER_MANAGE: 'user:manage',
  API_KEY_MANAGE: 'api_key:manage'
};

// Map roles to permissions
export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    // All permissions
    ...Object.values(PERMISSIONS)
  ],
  
  [ROLES.OPERATOR]: [
    PERMISSIONS.DEVICE_VIEW,
    PERMISSIONS.DEVICE_UPDATE,
    PERMISSIONS.FILE_VIEW,
    PERMISSIONS.FILE_UPLOAD,
    PERMISSIONS.FILE_DELETE,
    PERMISSIONS.FILE_MANAGE,
    PERMISSIONS.PLAYLIST_VIEW,
    PERMISSIONS.PLAYLIST_CREATE,
    PERMISSIONS.PLAYLIST_UPDATE,
    PERMISSIONS.PLAYLIST_DELETE,
    PERMISSIONS.PLAYER_CONTROL,
    PERMISSIONS.PLAYER_STOP
  ],
  
  [ROLES.VIEWER]: [
    PERMISSIONS.DEVICE_VIEW,
    PERMISSIONS.FILE_VIEW,
    PERMISSIONS.PLAYLIST_VIEW,
    PERMISSIONS.PLAYER_CONTROL
  ]
};

/**
 * Check if role has permission
 */
export function hasPermission(role, permission) {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

/**
 * Check if role has any of the permissions
 */
export function hasAnyPermission(role, permissions) {
  return permissions.some(p => hasPermission(role, p));
}

/**
 * Check if role has all permissions
 */
export function hasAllPermissions(role, permissions) {
  return permissions.every(p => hasPermission(role, p));
}

/**
 * Check if user role is higher or equal to required role
 */
export function hasRoleOrHigher(userRole, requiredRole) {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export default {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRoleOrHigher,
  getRolePermissions
};

