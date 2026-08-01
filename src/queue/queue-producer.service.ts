import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

@Injectable()
export class QueueProducerService {
  private readonly queues: Record<string, Queue>;

  constructor(
    @InjectQueue('code-generation') private readonly codeGenerationQueue: Queue,
    @InjectQueue('query-log') private readonly queryLogQueue: Queue,
    @InjectQueue('statistics') private readonly statisticsQueue: Queue,
    @InjectQueue('export') private readonly exportQueue: Queue,
    @InjectQueue('notification') private readonly notificationQueue: Queue,
  ) {
    this.queues = {
      'code-generation': codeGenerationQueue,
      'query-log': queryLogQueue,
      statistics: statisticsQueue,
      export: exportQueue,
      notification: notificationQueue,
    };
  }

  enqueueCodeGeneration(payload: Record<string, any>) {
    return this.codeGenerationQueue.add('generate', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400, count: 1000 },
    });
  }

  enqueueQueryLog(payload: Record<string, any>) {
    return this.queryLogQueue.add('write', payload, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 3600, count: 5000 },
      removeOnFail: { age: 86400, count: 5000 },
    });
  }

  async stats() {
    const entries = await Promise.all(Object.entries(this.queues).map(async ([name, queue]) => {
      const counts = await queue.getJobCounts('waiting', 'delayed', 'active', 'failed', 'completed', 'paused');
      return [name, counts] as const;
    }));
    return Object.fromEntries(entries);
  }
}
