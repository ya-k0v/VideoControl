# Playlist Management and Scheduling

VideoControl supports advanced playlist management with automatic scheduling capabilities.

## Features

- **Playlist Creation**: Create playlists with multiple files
- **Ordering**: Drag-and-drop reordering of playlist items
- **Looping**: Auto-loop playlists
- **Shuffling**: Random playback order
- **Scheduling**: Automatic playback based on time
- **Multi-Device**: Assign playlists to multiple devices
- **Priority**: Set priority for overlapping playlists

## Schedule Types

### 1. Cron Expression

Schedule playlists using standard cron expressions:

```json
{
  "type": "cron",
  "expression": "0 9 * * 1-5"
}
```

Examples:
- `0 9 * * *` - Every day at 9:00 AM
- `0 9 * * 1-5` - Weekdays at 9:00 AM
- `*/15 * * * *` - Every 15 minutes
- `0 12,18 * * *` - At 12:00 PM and 6:00 PM

### 2. Time Range

Play during specific time ranges:

```json
{
  "type": "timerange",
  "start": "09:00",
  "end": "17:00",
  "days": [1, 2, 3, 4, 5]
}
```

- `start`: Start time (HH:MM format)
- `end`: End time (HH:MM format)
- `days`: Array of days (0=Sunday, 1=Monday, ..., 6=Saturday)

### 3. Daily Schedule

Play at specific time every day:

```json
{
  "type": "daily",
  "time": "09:00"
}
```

## API Examples

### Create Playlist

```bash
POST /api/playlists
Authorization: Bearer YOUR_TOKEN

{
  "name": "Morning Announcements",
  "description": "Play announcements every morning",
  "loop": true,
  "shuffle": false,
  "schedule": {
    "type": "daily",
    "time": "09:00"
  }
}
```

### Add Items to Playlist

```bash
POST /api/playlists/{playlist_id}/items
Authorization: Bearer YOUR_TOKEN

{
  "fileId": "uuid-of-file",
  "order": 0,
  "duration": 30
}
```

### Assign to Device

```bash
POST /api/playlists/{playlist_id}/assign
Authorization: Bearer YOUR_TOKEN

{
  "deviceId": "device-123",
  "priority": 10
}
```

### Reorder Items

```bash
PUT /api/playlists/{playlist_id}/reorder
Authorization: Bearer YOUR_TOKEN

{
  "itemOrders": [
    { "itemId": "item-1", "order": 0 },
    { "itemId": "item-2", "order": 1 },
    { "itemId": "item-3", "order": 2 }
  ]
}
```

## Use Cases

### 1. Daily Announcements

```json
{
  "name": "Daily Announcements",
  "schedule": {
    "type": "cron",
    "expression": "0 9 * * 1-5"
  },
  "loop": false
}
```

### 2. Business Hours Content

```json
{
  "name": "Business Hours Promotions",
  "schedule": {
    "type": "timerange",
    "start": "09:00",
    "end": "18:00",
    "days": [1, 2, 3, 4, 5]
  },
  "loop": true,
  "shuffle": true
}
```

### 3. Event-Specific Content

```json
{
  "name": "Weekend Special",
  "schedule": {
    "type": "timerange",
    "start": "10:00",
    "end": "20:00",
    "days": [0, 6]
  }
}
```

## Scheduler Control

### Start Scheduler

```bash
POST /api/scheduler/start
Authorization: Bearer ADMIN_TOKEN
```

### Stop Scheduler

```bash
POST /api/scheduler/stop
Authorization: Bearer ADMIN_TOKEN
```

### Get Status

```bash
GET /api/scheduler/status
Authorization: Bearer YOUR_TOKEN
```

Response:
```json
{
  "running": true,
  "tasksCount": 5,
  "tasks": [
    {
      "playlistId": "uuid",
      "type": "cron",
      "schedule": {
        "type": "cron",
        "expression": "0 9 * * *"
      },
      "running": true
    }
  ]
}
```

## Best Practices

1. **Test Schedules**: Test schedules in development before production
2. **Avoid Conflicts**: Be careful with overlapping schedules
3. **Use Priority**: Set higher priority for important playlists
4. **Monitor Logs**: Check scheduler logs for execution
5. **Backup Playlists**: Export playlists regularly

## Troubleshooting

### Playlist Not Playing

1. Check if scheduler is running: `GET /api/scheduler/status`
2. Verify schedule format is correct
3. Check if playlist has items
4. Verify device assignment is active
5. Check logs: `tail -f logs/combined-*.log | grep scheduler`

### Schedule Not Triggering

1. Validate cron expression: Use [crontab.guru](https://crontab.guru)
2. Check server timezone
3. Verify playlist is active
4. Check if devices are online

## Cron Expression Reference

```
* * * * *
│ │ │ │ │
│ │ │ │ └─ Day of week (0-7, 0 or 7 = Sunday)
│ │ │ └─── Month (1-12)
│ │ └───── Day of month (1-31)
│ └─────── Hour (0-23)
└───────── Minute (0-59)
```

Special characters:
- `*` - Any value
- `,` - List (e.g., `1,3,5`)
- `-` - Range (e.g., `1-5`)
- `/` - Step (e.g., `*/15`)

