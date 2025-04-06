import { Zone, Job } from "@prisma/client";
import { UserEnergyState } from "../models/UserEnergyState";

export interface ZoneWithJobs extends Zone {
  jobs: Job[];
}

export interface IZoneService {
  // Zone retrieval
  getZoneById(zoneId: string): Promise<ZoneWithJobs | null>;
  getZoneByName(name: string): Promise<ZoneWithJobs | null>;
  getAllZones(): Promise<ZoneWithJobs[]>;
  
  // Zone access
  userCanAccessZone(userId: string, zoneId: string): Promise<{ canAccess: boolean; reason?: string }>;
  getAccessibleZones(userId: string): Promise<ZoneWithJobs[]>;
  
  // Zone management
  createZone(
    name: string, 
    description: string, 
    requiredLevel: number,
    isEnergyRecoveryZone?: boolean,
    energyRecoveryMultiplier?: number
  ): Promise<Zone>;
  
  addJobToZone(zoneId: string, jobId: string): Promise<Job>;
  
  // Energy recovery zone operations
  enterRecoveryZone(userId: string, zoneId: string): Promise<UserEnergyState>;
  leaveRecoveryZone(userId: string): Promise<UserEnergyState>;
  getRecoveryZones(): Promise<ZoneWithJobs[]>;
  
  // Cache operations
  clearCache(): void;
  refreshCache(): Promise<void>;
}