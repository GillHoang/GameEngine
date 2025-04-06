import { Job, Item } from "@prisma/client";

export interface WorkResult {
  success: boolean;
  energyConsumed: number;
  xpGained: number;
  itemsGained: Array<{
    item: Item;
    quantity: number;
  }>;
  leveledUp: boolean;
  error?: string;
}

export interface JobWithRewards extends Job {
  rewards: Array<{
    item: Item;
    minAmount: number;
    maxAmount: number;
    chance: number;
  }>;
}

export interface IActionHandler {
  // Work-related actions
  performWork(
    userId: string,
    jobId: string,
    toolInstanceId?: string
  ): Promise<WorkResult>;
  getAvailableJobs(userId: string): Promise<Job[]>;
  getJobById(jobId: string): Promise<JobWithRewards | null>;

  // Tool usage
  useToolForJob(
    userId: string,
    jobId: string,
    toolInstanceId: string
  ): Promise<WorkResult>;
}
