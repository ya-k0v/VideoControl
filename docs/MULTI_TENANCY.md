# Multi-Tenancy in VideoControl

VideoControl supports multi-tenancy, allowing multiple organizations to use the same installation with complete data isolation.

## Overview

Multi-tenancy enables:
- **Organization Isolation**: Complete data separation between organizations
- **User Management**: Organization-specific users with roles
- **Resource Limits**: Per-organization limits on devices, users, storage
- **Flexible Plans**: FREE, STARTER, PRO, ENTERPRISE tiers
- **Secure Access**: Automatic filtering ensures users only see their org's data

## Organization Plans

### FREE Plan
- **Max Devices**: 5
- **Max Users**: 3
- **Storage**: 5 GB
- **Features**: Basic functionality

### STARTER Plan
- **Max Devices**: 20
- **Max Users**: 10
- **Storage**: 50 GB
- **Features**: All basic features + scheduling

### PRO Plan
- **Max Devices**: 100
- **Max Users**: 50
- **Storage**: 500 GB
- **Features**: All starter features + API access + priority support

### ENTERPRISE Plan
- **Max Devices**: Unlimited
- **Max Users**: Unlimited
- **Storage**: Unlimited
- **Features**: All pro features + dedicated support + custom features

## API Examples

### Create Organization

```bash
POST /api/organizations
Authorization: Bearer ADMIN_TOKEN

{
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "plan": "PRO",
  "maxDevices": 100,
  "maxUsers": 50,
  "settings": {
    "timezone": "America/New_York",
    "defaultTheme": "dark"
  }
}
```

### Register User for Organization

```bash
POST /auth/register
Authorization: Bearer ADMIN_TOKEN

{
  "email": "user@acme-corp.com",
  "username": "acmeuser",
  "password": "SecurePassword123!",
  "role": "OPERATOR",
  "organizationId": "org-uuid"
}
```

### Get Organization Stats

```bash
GET /api/organizations/{org_id}/stats
Authorization: Bearer USER_TOKEN

Response:
{
  "users": {
    "count": 15,
    "max": 50,
    "percentage": 30
  },
  "devices": {
    "count": 45,
    "max": 100,
    "percentage": 45
  },
  "storage": {
    "used": 250000000000,
    "usedFormatted": "232.83 GB"
  }
}
```

## Data Isolation

### Automatic Filtering

All API queries are automatically filtered by organization:

```javascript
// Users can only see devices from their organization
GET /api/devices

// Internally filtered by organizationId
WHERE organizationId = user.organizationId
```

### Middleware Protection

```javascript
// Enforces organization context
app.use('/api/*', enforceOrganizationContext);

// Checks resource limits
app.post('/api/devices', 
  checkOrganizationLimits('device'),
  createDevice
);
```

## User Roles per Organization

### ADMIN
- Manage organization settings
- Manage all users in organization
- Manage all devices
- Full access to all features

### OPERATOR
- Create/edit content
- Manage devices
- Control playback
- View analytics

### VIEWER
- View devices
- View content
- Basic playback control

## Security Features

### 1. Row-Level Security

All database queries include organization filter:

```sql
SELECT * FROM devices 
WHERE organizationId = :userOrgId
```

### 2. API Key Isolation

API keys are organization-specific and can't access other orgs' data.

### 3. Session Isolation

User sessions are tied to their organization, preventing cross-org access.

### 4. File Storage Separation

Files are stored in organization-specific directories:

```
/public/content/{organizationId}/{deviceId}/{file}
```

## Migration from Single-Tenant

To migrate existing single-tenant data:

1. Create default organization:

```bash
POST /api/organizations
{
  "name": "Default Organization",
  "slug": "default",
  "plan": "ENTERPRISE"
}
```

2. Run migration script:

```bash
node src/database/migration/migrate-to-multi-tenant.js
```

This will:
- Assign all existing users to default organization
- Assign all existing devices to default organization
- Update all foreign keys

## Best Practices

### 1. Organization Naming
- Use descriptive names
- Keep slugs URL-friendly (lowercase, hyphens)
- Avoid special characters in slugs

### 2. User Management
- Assign appropriate roles
- Review user access regularly
- Disable inactive users

### 3. Resource Monitoring
- Monitor usage stats regularly
- Set up alerts for limit approaches
- Upgrade plans proactively

### 4. Data Backup
- Backup per organization
- Test restore procedures
- Document backup schedule

## Limitations

### Cannot Access Across Organizations
- Users cannot see devices from other orgs
- Content cannot be shared between orgs
- API keys are org-specific

### Plan Limits Enforced
- Device creation blocked at limit
- User creation blocked at limit
- Storage uploads may be rejected

## Troubleshooting

### User Can't See Devices

1. Check user's organization ID:
```bash
GET /auth/me
```

2. Verify device belongs to same organization:
```bash
GET /api/devices/{device_id}
```

### Limit Reached Errors

1. Check current usage:
```bash
GET /api/organizations/{org_id}/stats
```

2. Options:
   - Upgrade plan
   - Remove unused resources
   - Contact support for increase

### Organization Not Found

1. Verify organization exists:
```bash
GET /api/organizations/{org_id}
```

2. Check user has access:
```bash
GET /auth/me
# Verify organizationId matches
```

## API Reference

### Organization Endpoints

- `GET /api/organizations` - List all orgs (admin only)
- `GET /api/organizations/:id` - Get organization details
- `GET /api/organizations/:id/stats` - Get usage statistics
- `POST /api/organizations` - Create organization (admin only)
- `PUT /api/organizations/:id` - Update organization
- `DELETE /api/organizations/:id` - Delete organization (admin only)

### Protected Endpoints

All these endpoints are automatically filtered by organization:

- `/api/devices/*`
- `/api/files/*`
- `/api/playlists/*`
- `/api/users/*` (within org)

## Future Enhancements

- [ ] Cross-organization content sharing (with permissions)
- [ ] Organization templates
- [ ] Billing integration
- [ ] Usage analytics dashboard
- [ ] Organization-level branding
- [ ] Sub-organizations (departments)

