import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { OverviewStats } from './components/OverviewStats';
import { TrafficControl } from './components/TrafficControl';
import { TokenBucketVisualizer } from './components/TokenBucketVisualizer';
import { LiveStreamTable } from './components/LiveStreamTable';
import { HeadersInspector } from './components/HeadersInspector';
import type { RequestRecord, ClusterHealth, NodeInfo, Stats } from './types';

export const App: React.FC = () => {
  // ── Cluster State ────────────────────────────────────────────────────────
  const [health, setHealth] = useState<ClusterHealth>({
    gatewayStatus: 'online',
    redisConnected: true,
    failStrategy: 'open',
  });
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);

  // ── Controls State ───────────────────────────────────────────────────────
  const [clientKey, setClientKey] = useState<string>('client-alpha');
  const [tier, setTier] = useState<string>('');
  const [routePreset, setRoutePreset] = useState<string>('GET:/api/hello');

  const getInitialLimit = useCallback(() => {
    if (routePreset === 'POST:/auth/login') return 5;
    if (routePreset === 'GET:/api/v1/search') return 30;
    if (routePreset === 'POST:/webhooks/event') return 50;
    if (tier === 'free') return 20;
    if (tier === 'pro') return 500;
    if (tier === 'internal') return 10000;
    return 100;
  }, [routePreset, tier]);

  const [currentLimit, setCurrentLimit] = useState<number>(100);
  const [remainingTokens, setRemainingTokens] = useState<number>(100);
  const [resetTimestamp, setResetTimestamp] = useState<number>(Date.now() + 60000);

  useEffect(() => {
    const lim = getInitialLimit();
    setCurrentLimit(lim);
  }, [getInitialLimit]);

  // ── Telemetry State ──────────────────────────────────────────────────────
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<RequestRecord | null>(null);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    allowed: 0,
    blocked: 0,
    latencies: [],
  });

  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [autoSpam, setAutoSpam] = useState<boolean>(false);
  const [spammerRate, setSpammerRate] = useState<number>(5);

  const autoSpamRef = useRef<number | null>(null);

  // ── Cluster Health Polling ───────────────────────────────────────────────
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/health');
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setHealth({
          gatewayStatus: 'online',
          redisConnected: true,
          failStrategy: data.redis?.failStrategy ?? 'open',
        });
      } else if (data.redis && !data.redis.connected) {
        setHealth({
          gatewayStatus: 'degraded',
          redisConnected: false,
          failStrategy: data.redis.failStrategy ?? 'open',
        });
      }
    } catch {
      setHealth({
        gatewayStatus: 'unreachable',
        redisConnected: false,
        failStrategy: 'unknown',
      });
    }
  }, []);

  const fetchNodeInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/demo/node-info');
      if (res.ok) {
        const data = await res.json();
        setNodeInfo(data);
      }
    } catch {
      // Optional node info
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchNodeInfo();
    const interval = setInterval(fetchHealth, 4000);
    return () => clearInterval(interval);
  }, [fetchHealth, fetchNodeInfo]);

  // ── Firing Engine ────────────────────────────────────────────────────────
  const fireRequest = useCallback(async () => {
    const [method, path] = routePreset.split(':');
    const headers: Record<string, string> = {
      'x-api-key': clientKey.trim() || 'demo-client',
    };
    if (tier) {
      headers['x-client-tier'] = tier;
    }

    const tStart = performance.now();
    let res: Response | null = null;
    let jsonBody: Record<string, unknown> | null = null;
    let errorMsg: string | null = null;

    try {
      res = await fetch(path, {
        method,
        headers,
      });
      jsonBody = await res.json();
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : 'Network Error';
    }

    const durationMs = Math.round(performance.now() - tStart);

    // Read IETF headers
    const hdrLimit = res ? res.headers.get('ratelimit-limit') || res.headers.get('RateLimit-Limit') : null;
    const hdrRemaining = res ? res.headers.get('ratelimit-remaining') || res.headers.get('RateLimit-Remaining') : null;
    const hdrReset = res ? res.headers.get('ratelimit-reset') || res.headers.get('RateLimit-Reset') : null;
    const hdrAlgo = res ? res.headers.get('x-ratelimit-algorithm') : null;
    const hdrRetryAfter = res ? res.headers.get('retry-after') : null;
    const hdrDegraded = res ? res.headers.get('x-ratelimit-degraded') : null;

    const statusCode = res ? res.status : 0;
    const isAllowed = statusCode === 200;
    const isBlocked = statusCode === 429;

    let newRem = remainingTokens;
    if (hdrRemaining !== null && hdrRemaining !== undefined) {
      newRem = Math.max(0, parseInt(hdrRemaining, 10));
    } else if (isBlocked) {
      newRem = 0;
    }
    setRemainingTokens(newRem);

    if (hdrLimit) {
      setCurrentLimit(parseInt(hdrLimit, 10));
    }

    let resetEpoch = resetTimestamp;
    if (hdrReset) {
      resetEpoch = parseInt(hdrReset, 10) * 1000;
      setResetTimestamp(resetEpoch);
    } else if (jsonBody && typeof jsonBody.resetAt === 'string') {
      resetEpoch = new Date(jsonBody.resetAt).getTime();
      setResetTimestamp(resetEpoch);
    }

    // Update Stats
    setStats((prev) => {
      const nextLatencies = [...prev.latencies, durationMs];
      if (nextLatencies.length > 50) nextLatencies.shift();
      return {
        total: prev.total + 1,
        allowed: isAllowed ? prev.allowed + 1 : prev.allowed,
        blocked: isBlocked ? prev.blocked + 1 : prev.blocked,
        latencies: nextLatencies,
      };
    });

    const record: RequestRecord = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      time: new Date().toLocaleTimeString(),
      method,
      path,
      statusCode,
      durationMs,
      remaining: newRem,
      limit: hdrLimit ? parseInt(hdrLimit, 10) : currentLimit,
      resetTimestamp: resetEpoch,
      algorithm: hdrAlgo || (jsonBody && String(jsonBody.algorithm)) || 'token-bucket',
      retryAfter: hdrRetryAfter,
      degraded: hdrDegraded === 'true' || Boolean(jsonBody && jsonBody.degraded),
      payload: jsonBody || { error: errorMsg },
    };

    setRequests((prev) => [record, ...prev.slice(0, 49)]);
    setSelectedRecord(record);
  }, [clientKey, currentLimit, remainingTokens, resetTimestamp, routePreset, tier]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleFireSingle = async () => {
    setIsActionLoading(true);
    await fireRequest();
    setIsActionLoading(false);
  };

  const handleFireBurst5 = async () => {
    setIsActionLoading(true);
    await Promise.all(Array.from({ length: 5 }, () => fireRequest()));
    setIsActionLoading(false);
  };

  const handleFireBurst20 = async () => {
    setIsActionLoading(true);
    await Promise.all(Array.from({ length: 20 }, () => fireRequest()));
    setIsActionLoading(false);
  };

  const handleFireFlood = async () => {
    setIsActionLoading(true);
    for (let batch = 0; batch < 8; batch++) {
      await Promise.all(Array.from({ length: 10 }, () => fireRequest()));
      await new Promise((r) => setTimeout(r, 40));
    }
    setIsActionLoading(false);
  };

  // ── Auto-Spammer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoSpam) {
      const intervalMs = Math.max(40, Math.floor(1000 / spammerRate));
      autoSpamRef.current = window.setInterval(() => {
        fireRequest();
      }, intervalMs);
    } else {
      if (autoSpamRef.current) {
        clearInterval(autoSpamRef.current);
        autoSpamRef.current = null;
      }
    }
    return () => {
      if (autoSpamRef.current) {
        clearInterval(autoSpamRef.current);
      }
    };
  }, [autoSpam, spammerRate, fireRequest]);

  // ── Reset Quota ──────────────────────────────────────────────────────────
  const handleResetQuota = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch('/api/demo/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: clientKey }),
      });
      const data = await res.json();
      if (data.success) {
        setRemainingTokens(currentLimit);
        setResetTimestamp(Date.now() + 60000);
      }
    } catch (err) {
      console.error('Failed to reset quota:', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="app-root">

      <Header health={health} nodeInfo={nodeInfo} />

      <main className="main-wrapper">
        {/* Top KPI Metric Ribbon */}
        <OverviewStats
          currentLimit={currentLimit}
          remainingTokens={remainingTokens}
          resetTimestamp={resetTimestamp}
          stats={stats}
        />

        {/* Top Grid: Traffic Control Studio & Visualizer Vessel */}
        <div className="two-panel-grid">
          <TrafficControl
            clientKey={clientKey}
            setClientKey={setClientKey}
            tier={tier}
            setTier={setTier}
            routePreset={routePreset}
            setRoutePreset={setRoutePreset}
            currentLimit={currentLimit}
            onFireSingle={handleFireSingle}
            onFireBurst5={handleFireBurst5}
            onFireBurst20={handleFireBurst20}
            onFireFlood={handleFireFlood}
            autoSpam={autoSpam}
            setAutoSpam={setAutoSpam}
            spammerRate={spammerRate}
            setSpammerRate={setSpammerRate}
            onResetQuota={handleResetQuota}
            isActionLoading={isActionLoading}
          />

          <TokenBucketVisualizer
            currentLimit={currentLimit}
            remainingTokens={remainingTokens}
            resetTimestamp={resetTimestamp}
            stats={stats}
          />
        </div>

        {/* Bottom Grid: Live Ingress Stream & Headers Inspector */}
        <div className="two-panel-grid">
          <LiveStreamTable
            requests={requests}
            selectedId={selectedRecord?.id ?? null}
            onSelect={(rec) => setSelectedRecord(rec)}
            onClear={() => {
              setRequests([]);
              setSelectedRecord(null);
            }}
          />

          <HeadersInspector selectedRecord={selectedRecord} />
        </div>

      </main>

      <footer className="app-footer-bar">
        <div className="app-footer-inner">
          <p>LimitX · Rate Limit Gateway</p>
          <div className="footer-links-row">
            <a href="/health" target="_blank" rel="noreferrer">GET /health</a>
            <a href="/health/ready" target="_blank" rel="noreferrer">GET /health/ready</a>
            <a href="/api/demo/config" target="_blank" rel="noreferrer">GET /api/demo/config</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
