# Scaling VideoControl for Production

This guide covers horizontal scaling, load balancing, caching, and performance optimization.

## Architecture Overview

### Single Server (Basic)
```
Internet → NGINX → VideoControl (Port 3000) → SQLite/PostgreSQL
```

### Multi-Server (Scaled)
```
Internet → NGINX Load Balancer
            ├→ VideoControl Instance 1 (Port 3000)
            ├→ VideoControl Instance 2 (Port 3001)
            └→ VideoControl Instance 3 (Port 3002)
                ↓
              Redis (Cache + Session Store)
                ↓
            PostgreSQL (Database)
```

## 1. Redis Caching

### Setup Redis

```bash
# Install Redis
sudo apt-get install redis-server

# Start Redis
sudo systemctl start redis
sudo systemctl enable redis
```

### Enable in VideoControl

```bash
# .env
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
```

### Cache Configuration

```javascript
// Cache API responses
app.get('/api/devices', 
  cacheMiddleware(60), // Cache for 60 seconds
  getDevices
);

// Invalidate cache on mutations
app.post('/api/devices',
  invalidateCacheMiddleware(['GET:*/devices*']),
  createDevice
);
```

### What Gets Cached

- **Device lists**: 60 seconds
- **File lists**: 30 seconds
- **Playlist data**: 120 seconds
- **User sessions**: 24 hours
- **API responses**: Configurable per endpoint

## 2. Horizontal Scaling

### Run Multiple Instances

```bash
# Instance 1
PORT=3000 npm start

# Instance 2
PORT=3001 npm start

# Instance 3
PORT=3002 npm start
```

### Using PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start cluster
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs
```

#### ecosystem.config.js

```javascript
module.exports = {
  apps: [{
    name: 'videocontrol',
    script: './server.js',
    instances: 4, // or 'max' for all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

## 3. Load Balancing with NGINX

### Install NGINX

```bash
sudo apt-get install nginx
```

### Configure Load Balancer

Copy the provided configuration:

```bash
sudo cp nginx/load-balancer.conf /etc/nginx/sites-available/videocontrol
sudo ln -s /etc/nginx/sites-available/videocontrol /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Load Balancing Methods

#### Round Robin (Default)
Distributes requests evenly across servers.

#### Least Connections
```nginx
upstream videocontrol_backend {
    least_conn;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
}
```

#### IP Hash (Sticky Sessions)
```nginx
upstream videocontrol_backend {
    ip_hash;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
}
```

## 4. Database Optimization

### Use PostgreSQL for Production

```bash
# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Create database
sudo -u postgres createdb videocontrol

# Update .env
DATABASE_PROVIDER=postgresql
DATABASE_URL="postgresql://user:password@localhost:5432/videocontrol"
```

### Connection Pooling

Prisma handles connection pooling automatically:

```javascript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Connection pool settings
  connection_limit = 10
}
```

### Database Indexes

Already configured in schema for:
- Organization ID (multi-tenancy)
- Device status
- File types
- User roles

### Query Optimization

```javascript
// Use select to fetch only needed fields
const devices = await prisma.device.findMany({
  select: {
    id: true,
    name: true,
    status: true
  }
});

// Use pagination
const devices = await prisma.device.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize
});
```

## 5. File Storage Optimization

### CDN Integration

For large-scale deployments, use a CDN:

```javascript
// Upload to S3/CloudFlare R2
const uploadToCDN = async (file) => {
  // Upload to CDN
  const cdnUrl = await s3.upload(file);
  
  // Store CDN URL in database
  await prisma.file.create({
    data: {
      fileName: file.name,
      cdnUrl: cdnUrl
    }
  });
};
```

### Local Storage Structure

```
/public/content/{organizationId}/{deviceId}/{file}
```

Benefits:
- Organization isolation
- Easy backup per organization
- Parallel file serving

## 6. Socket.IO Scaling

### Redis Adapter for Socket.IO

```javascript
import { createAdapter } from 'socket.io-redis';
import Redis from 'ioredis';

const pubClient = new Redis(process.env.REDIS_URL);
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

### Sticky Sessions Required

For Socket.IO, use `ip_hash` in NGINX to ensure connections stay on same server.

## 7. Performance Monitoring

### Key Metrics to Monitor

- **Request latency**: <200ms average
- **Error rate**: <1%
- **CPU usage**: <70%
- **Memory usage**: <80%
- **Database connections**: Monitor pool usage
- **Cache hit rate**: >80%

### Grafana Dashboards

Access monitoring at:
- Grafana: http://localhost:3001
- Prometheus: http://localhost:9090

### Alerts

Configure alerts in `monitoring/prometheus/alerts.yml`:
- High latency (>5s)
- Error rate spike
- Service down
- Memory/CPU high

## 8. Capacity Planning

### Estimated Capacity per Server

**Single VideoControl Instance (2 CPU, 4GB RAM):**
- 50-100 concurrent connections
- 500 devices
- 10,000 files
- 1 TB storage

**With Load Balancer (3 instances):**
- 150-300 concurrent connections
- 1,500 devices
- 30,000 files
- 3 TB storage

### When to Scale

Scale horizontally when:
- CPU consistently >70%
- Response time >500ms
- Connection errors increase
- WebSocket connections exceed capacity

## 9. Security at Scale

### Rate Limiting

```javascript
// Redis-based rate limiting
app.use('/api', redisRateLimit({
  windowMs: 60000,
  max: 100
}));
```

### DDoS Protection

Use NGINX rate limiting:

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req zone=api_limit burst=20 nodelay;
```

### Firewall Rules

```bash
# Allow only necessary ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3000:3002/tcp # Block direct access to app
```

## 10. Backup and Disaster Recovery

### Database Backups

```bash
# Automated daily backup
0 2 * * * pg_dump videocontrol | gzip > /backup/db-$(date +\%Y\%m\%d).sql.gz
```

### File Backups

```bash
# Sync to remote storage
rsync -avz /public/content/ user@backup-server:/backups/content/
```

### Redis Persistence

```bash
# redis.conf
save 900 1
save 300 10
save 60 10000
```

## Troubleshooting

### High CPU Usage

1. Check slow queries in PostgreSQL
2. Review cache hit rate
3. Optimize database indexes
4. Add more instances

### Memory Leaks

1. Monitor with `pm2 monit`
2. Check for unclosed connections
3. Review file upload handling
4. Restart instances periodically

### Socket.IO Connection Issues

1. Verify sticky sessions are enabled
2. Check Redis adapter is working
3. Monitor WebSocket connection count
4. Increase timeout values

## Best Practices

1. **Always use PostgreSQL in production** (not SQLite)
2. **Enable Redis caching** for better performance
3. **Use PM2 or systemd** for process management
4. **Monitor everything** with Prometheus/Grafana
5. **Regular backups** - database and files
6. **Load testing** before going live
7. **CDN for static files** in multi-region deployments
8. **SSL/TLS everywhere** - no exceptions
9. **Keep dependencies updated** for security
10. **Document your architecture** for team

## Load Testing

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test API endpoint
ab -n 1000 -c 10 http://localhost/api/devices

# Test with authentication
ab -n 1000 -c 10 -H "Authorization: Bearer TOKEN" http://localhost/api/devices
```

## Resources

- [NGINX Load Balancing](https://nginx.org/en/docs/http/load_balancing.html)
- [Redis Best Practices](https://redis.io/topics/best-practices)
- [PostgreSQL Performance](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Socket.IO Scaling](https://socket.io/docs/v4/using-multiple-nodes/)

