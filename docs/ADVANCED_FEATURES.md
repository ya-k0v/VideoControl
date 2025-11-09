# Advanced Video Features

VideoControl supports advanced features for professional video installations including live streaming, video walls, and 4K HDR content.

## Live Streaming (RTMP/HLS)

### Overview

Stream live video to your devices using RTMP protocol, automatically transcoded to HLS for playback.

### Setup RTMP Server

The RTMP server starts automatically with VideoControl (if enabled):

```bash
# .env
RTMP_ENABLED=true
RTMP_PORT=1935
HLS_PORT=8000
```

### Publish Stream

Use OBS Studio or any RTMP encoder:

```
RTMP URL: rtmp://your-server:1935/live
Stream Key: your-stream-key
```

### Playback

HLS stream available at:
```
http://your-server:8000/live/your-stream-key/index.m3u8
```

### API Examples

#### Get Active Streams

```bash
GET /api/streaming/active
Authorization: Bearer TOKEN

Response:
[
  {
    "id": "stream_1",
    "streamKey": "device1-live",
    "startTime": "2024-01-01T10:00:00Z",
    "viewers": 5,
    "duration": 3600000
  }
]
```

#### Get Stream Stats

```bash
GET /api/streaming/device1-live
Authorization: Bearer TOKEN

Response:
{
  "streamKey": "device1-live",
  "startTime": "2024-01-01T10:00:00Z",
  "viewers": 5,
  "duration": 3600000,
  "hlsUrl": "http://server:8000/live/device1-live/index.m3u8",
  "rtmpUrl": "rtmp://server:1935/live/device1-live"
}
```

### OBS Studio Configuration

1. Settings → Stream
2. Service: Custom
3. Server: `rtmp://your-server:1935/live`
4. Stream Key: `your-device-id`
5. Output: 1920x1080, 30fps, 4000kbps

## Video Wall

### Overview

Synchronize multiple devices to create a large video wall display with perfect timing.

### Create Video Wall

```bash
POST /api/videowall
Authorization: Bearer TOKEN

{
  "name": "Lobby Video Wall",
  "layout": {
    "rows": 2,
    "cols": 3
  },
  "devices": [
    { "deviceId": "screen1", "position": { "row": 0, "col": 0 } },
    { "deviceId": "screen2", "position": { "row": 0, "col": 1 } },
    { "deviceId": "screen3", "position": { "row": 0, "col": 2 } },
    { "deviceId": "screen4", "position": { "row": 1, "col": 0 } },
    { "deviceId": "screen5", "position": { "row": 1, "col": 1 } },
    { "deviceId": "screen6", "position": { "row": 1, "col": 2 } }
  ],
  "syncMode": "tight"
}
```

### Play on Video Wall

```bash
POST /api/videowall/videowall_123/play
Authorization: Bearer TOKEN

{
  "file": {
    "fileName": "4k-video.mp4",
    "deviceId": "screen1"
  }
}
```

### Sync Modes

**Tight Sync** (`syncMode: "tight"`):
- Sync tolerance: 50ms
- Best for: Adjacent screens, critical timing
- Check interval: 1 second
- Higher CPU/network usage

**Loose Sync** (`syncMode: "loose"`):
- Sync tolerance: 200ms
- Best for: Distant screens, less critical timing
- Check interval: 5 seconds
- Lower CPU/network usage

### Video Wall Layouts

#### 2x2 Layout
```
┌─────┬─────┐
│  1  │  2  │
├─────┼─────┤
│  3  │  4  │
└─────┴─────┘
```

#### 3x3 Layout
```
┌─────┬─────┬─────┐
│  1  │  2  │  3  │
├─────┼─────┼─────┤
│  4  │  5  │  6  │
├─────┼─────┼─────┤
│  7  │  8  │  9  │
└─────┴─────┴─────┘
```

#### Custom Layout
```
┌──────┬─────┬─────┐
│      │  2  │  3  │
│   1  ├─────┼─────┤
│      │  4  │  5  │
└──────┴─────┴─────┘
```

## 4K HDR Support

### H.265/HEVC Encoding

Encode videos to H.265 for better 4K compression:

```javascript
import { H265Encoder } from './src/video/h265-encoder.js';

const encoder = new H265Encoder({
  preset: 'medium',
  crf: 23
});

// Encode to 4K
await encoder.encode4K('input.mp4', 'output-4k.mp4', {
  resolution: '3840x2160',
  fps: 30,
  bitrate: '20M',
  hwaccel: 'nvenc' // Use NVIDIA GPU
});
```

### Hardware Acceleration

Supported accelerators:

- **NVIDIA** (nvenc): RTX 2000+ series
- **Intel Quick Sync** (qsv): 6th gen+ processors
- **Apple VideoToolbox**: M1/M2 Macs
- **Software**: CPU-only (slower)

Check available acceleration:

```bash
POST /api/video/check-hwaccel
Authorization: Bearer TOKEN

Response:
{
  "nvenc": true,
  "qsv": false,
  "videotoolbox": false,
  "optimal": "nvenc"
}
```

### HDR10 Encoding

```javascript
await encoder.encodeHDR('input.mp4', 'output-hdr.mp4', {
  colorSpace: 'bt2020',
  colorTransfer: 'smpte2084',
  maxCLL: '1000,300'
});
```

### Video Formats

**Supported Input**:
- H.264 (AVC)
- H.265 (HEVC)
- VP9
- ProRes
- DNxHD

**Optimized Output**:
- H.265 (HEVC) - Best for 4K
- H.264 (AVC) - Best for 1080p
- VP9 - WebM fallback

### Bitrate Recommendations

| Resolution | H.264 Bitrate | H.265 Bitrate |
|------------|---------------|---------------|
| 720p       | 2-4 Mbps      | 1-2 Mbps      |
| 1080p      | 4-8 Mbps      | 2-4 Mbps      |
| 1440p      | 8-12 Mbps     | 4-6 Mbps      |
| 4K (2160p) | 20-40 Mbps    | 10-20 Mbps    |
| 8K (4320p) | 80-160 Mbps   | 40-80 Mbps    |

## Best Practices

### Live Streaming

1. **Bandwidth**: Ensure 2x stream bitrate available
2. **Latency**: Use HLS for scalability, WebRTC for low-latency
3. **Backup**: Have redundant streams
4. **Authentication**: Protect publish endpoints

### Video Walls

1. **Network**: Use wired gigabit connections
2. **Sync**: Test sync thoroughly before deployment
3. **Bezel Compensation**: Account for screen bezels in content
4. **Content**: Create content specifically for video wall resolution
5. **Calibration**: Match color/brightness across all screens

### 4K Content

1. **Hardware**: Use GPU acceleration when possible
2. **Storage**: Budget 1TB per hour of 4K footage
3. **Network**: Ensure 100+ Mbps for 4K streaming
4. **Testing**: Test on target hardware before deployment
5. **Fallback**: Have 1080p versions for older devices

## Troubleshooting

### RTMP Stream Not Starting

1. Check firewall: Port 1935 open
2. Verify stream key is correct
3. Check FFmpeg installation
4. Review logs: `tail -f logs/combined-*.log | grep RTMP`

### Video Wall Out of Sync

1. Check network latency between devices
2. Verify all devices have same video file
3. Increase sync tolerance
4. Use wired connections
5. Check device clock sync (NTP)

### 4K Playback Stuttering

1. Check device hardware capabilities
2. Use H.265 instead of H.264
3. Enable hardware acceleration
4. Reduce bitrate
5. Pre-cache content

## Example Implementations

### Conference Room Video Wall

```javascript
// 3x2 video wall for conference room
const videoWall = await videoWallManager.createVideoWall({
  id: 'conference-wall',
  name: 'Conference Room Display',
  layout: { rows: 2, cols: 3 },
  devices: [
    { deviceId: 'conf-screen-1', position: { row: 0, col: 0 } },
    // ... 5 more screens
  ],
  syncMode: 'tight'
});

// Play 4K presentation
await videoWallManager.play('conference-wall', {
  fileName: '4k-presentation.mp4',
  deviceId: 'conf-screen-1'
});
```

### Live Event Streaming

```javascript
// Start RTMP server
const rtmpServer = new RTMPServer({
  rtmpPort: 1935,
  httpPort: 8000,
  secret: process.env.STREAM_SECRET
});

rtmpServer.start();

// Monitor active streams
setInterval(() => {
  const streams = rtmpServer.getActiveStreams();
  console.log(`Active streams: ${streams.length}`);
}, 60000);
```

## Performance Tuning

### RTMP Server

```javascript
// Increase chunk size for high bitrate
rtmp: {
  chunk_size: 60000,
  gop_cache: true,
  ping: 30,
  ping_timeout: 60
}
```

### Video Wall Sync

```javascript
// Adjust sync offset based on network
videoWall.syncOffset = 100; // ms

// Monitor and auto-adjust
videoWall.autoAdjustSync = true;
```

### 4K Encoding

```javascript
// Use fastest preset for real-time
const encoder = new H265Encoder({
  preset: 'ultrafast',
  crf: 28 // Lower quality for speed
});
```

