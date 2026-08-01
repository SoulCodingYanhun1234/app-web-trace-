import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueueProducerService } from '../queue/queue-producer.service.js';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly httpDuration: Histogram<string>;
  readonly httpRequests: Counter<string>;
  readonly httpErrors: Counter<string>;
  readonly httpInFlight: Gauge<string>;
  readonly dbConnections: Gauge<string>;
  readonly slowQueries: Gauge<string>;
  readonly queueDepth: Gauge<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueProducerService,
  ) {
    this.registry.setDefaultLabels({
      service: process.env.SERVICE_NAME || 'trace-enterprise-api',
      env: process.env.NODE_ENV || 'development',
    });
    collectDefaultMetrics({ register: this.registry, prefix: 'node_' });

    this.httpRequests = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
    this.httpErrors = new Counter({
      name: 'http_request_errors_total',
      help: 'Total HTTP errors',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
    this.httpInFlight = new Gauge({
      name: 'http_requests_in_flight',
      help: 'Current in-flight HTTP requests',
      labelNames: ['method', 'route'],
      registers: [this.registry],
    });
    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds. Use histogram_quantile(0.95/0.99, rate(..._bucket[5m])) for P95/P99.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 2, 5, 10],
      registers: [this.registry],
    });
    this.dbConnections = new Gauge({
      name: 'db_connections',
      help: 'Database connection counters from MySQL status',
      labelNames: ['state'],
      registers: [this.registry],
    });
    this.slowQueries = new Gauge({
      name: 'db_slow_queries_total',
      help: 'Prisma queries slower than SLOW_QUERY_MS',
      labelNames: ['threshold_ms'],
      registers: [this.registry],
    });
    this.queueDepth = new Gauge({
      name: 'queue_jobs_total',
      help: 'BullMQ job counts by queue and state',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
    });
  }

  private normalizeRoute(value: unknown) {
    return String(value || 'unknown').replace(/\?.*$/, '').replace(/\/\d+(?=\/|$)/g, '/:id');
  }

  beginHttp(method: string, route: string) {
    const labels = { method: String(method || 'GET'), route: this.normalizeRoute(route) };
    this.httpInFlight.inc(labels);
    const started = process.hrtime.bigint();
    return (statusCode: number | string) => {
      const status = String(statusCode || 200);
      const duration = Number(process.hrtime.bigint() - started) / 1e9;
      const doneLabels = { ...labels, status_code: status };
      this.httpInFlight.dec(labels);
      this.httpRequests.inc(doneLabels);
      this.httpDuration.observe(doneLabels, duration);
      if (Number(status) >= 400) this.httpErrors.inc(doneLabels);
      return duration;
    };
  }

  private async refreshRuntimeMetrics() {
    const [db, queueStats] = await Promise.all([
      this.prisma.getConnectionStats(),
      this.queues.stats().catch(() => ({})),
    ]);

    const dbMap: Record<string, string> = {
      Threads_connected: 'connected',
      Threads_running: 'running',
      Max_used_connections: 'max_used',
    };
    for (const [key, state] of Object.entries(dbMap)) {
      const value = Number((db as any)[key] || 0);
      this.dbConnections.set({ state }, value);
    }

    const slow = this.prisma.getSlowQueryStats();
    this.slowQueries.set({ threshold_ms: String(slow.threshold_ms) }, slow.count);

    for (const [queue, counts] of Object.entries(queueStats as Record<string, Record<string, number>>)) {
      for (const [state, count] of Object.entries(counts || {})) {
        this.queueDepth.set({ queue, state }, Number(count || 0));
      }
    }
  }

  contentType() {
    return this.registry.contentType;
  }

  async metrics() {
    await this.refreshRuntimeMetrics();
    return this.registry.metrics();
  }

  async snapshot() {
    const [db, queues] = await Promise.all([
      this.prisma.getConnectionStats(),
      this.queues.stats().catch(() => ({})),
    ]);
    return {
      service: process.env.SERVICE_NAME || 'trace-enterprise-api',
      env: process.env.NODE_ENV || 'development',
      slow_queries: this.prisma.getSlowQueryStats(),
      db_connections: db,
      queues,
      latency_note: 'P95/P99 由 Prometheus histogram_quantile 基于 http_request_duration_seconds_bucket 计算',
    };
  }
}
