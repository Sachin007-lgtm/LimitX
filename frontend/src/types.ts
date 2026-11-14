export interface RequestRecord {
  id: string;
  time: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  remaining: number;
  limit: number;
  resetTimestamp: number;
  algorithm: string;
  retryAfter: string | null;
  degraded: boolean;
  payload: Record<string, unknown>;
}

export interface ClusterHealth {
  gatewayStatus: "online" | "degraded" | "unreachable";
  redisConnected: boolean;
  failStrategy: string;
}

export interface NodeInfo {
  instanceId: string;
  port: number;
  uptimeSec: number;
  memoryMb: number;
}

export interface Stats {
  total: number;
  allowed: number;
  blocked: number;
  latencies: number[];
}
