# VideoControl Monitoring Stack

This directory contains the monitoring infrastructure for VideoControl using Prometheus and Grafana.

## Components

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards
- **Node Exporter**: System metrics (CPU, memory, disk, network)
- **Alertmanager**: Alert routing and management

## Quick Start

### Start Monitoring Stack

```bash
cd monitoring
docker-compose up -d
```

### Access

- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

### Stop Monitoring Stack

```bash
docker-compose down
```

## Metrics Available

### Application Metrics

- `videocontrol_devices_online` - Number of devices currently online
- `videocontrol_devices_total` - Total registered devices
- `videocontrol_http_requests_total` - Total HTTP requests
- `videocontrol_http_request_duration_seconds` - HTTP request duration
- `videocontrol_file_uploads_total` - Total file uploads
- `videocontrol_video_optimizations_total` - Total video optimizations
- `videocontrol_socket_connections` - Active Socket.IO connections
- `videocontrol_errors_total` - Total errors
- `videocontrol_auth_attempts_total` - Authentication attempts

### System Metrics (from Node Exporter)

- CPU usage
- Memory usage
- Disk I/O
- Network traffic
- System load

## Grafana Dashboards

Pre-configured dashboards are available in `grafana/dashboards/`:

1. **VideoControl Dashboard** - Main application metrics
2. **System Metrics** - Server resource usage
3. **Error Tracking** - Error rates and types

### Import Custom Dashboard

1. Go to Grafana (http://localhost:3001)
2. Login (admin/admin)
3. Click "+" → "Import"
4. Upload dashboard JSON from `grafana/dashboards/`

## Alerts

Alert rules are configured in `prometheus/alerts.yml`:

- High error rate
- No devices online
- High request latency
- Service down
- High memory usage
- Database slow queries
- High authentication failure rate

### Configure Alert Notifications

Edit `alertmanager/alertmanager.yml` to add:

- Email notifications
- Slack webhooks
- PagerDuty integration
- Custom webhooks

## Production Deployment

### Environment Variables

```bash
# Enable Prometheus metrics in production
export PROMETHEUS_ENABLED=true
export NODE_ENV=production
```

### Security

1. Change default Grafana password immediately
2. Enable HTTPS for Grafana
3. Restrict Prometheus access (firewall/auth)
4. Use strong passwords for all services

### Scaling

For high-traffic deployments:

1. Use Prometheus remote storage (e.g., Thanos, Cortex)
2. Configure Grafana clustering
3. Increase retention period if needed
4. Add more Node Exporters for multiple servers

## Troubleshooting

### Prometheus not scraping metrics

Check if VideoControl is exposing metrics:

```bash
curl http://localhost:3000/metrics
```

### Grafana can't connect to Prometheus

1. Check if Prometheus is running: `docker ps`
2. Verify network connectivity between containers
3. Check Prometheus targets: http://localhost:9090/targets

### High cardinality metrics

If metrics become too large:

1. Reduce label cardinality
2. Increase scrape interval
3. Adjust retention period

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Node Exporter](https://github.com/prometheus/node_exporter)
- [Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/)

