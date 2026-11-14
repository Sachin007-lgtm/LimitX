import React, { useEffect, useState } from 'react';
import type { Stats } from '../types';
import { Waves, Sparkles } from 'lucide-react';

interface TokenBucketVisualizerProps {
  currentLimit: number;
  remainingTokens: number;
  resetTimestamp: number;
  stats: Stats;
}

export const TokenBucketVisualizer: React.FC<TokenBucketVisualizerProps> = ({
  currentLimit,
  remainingTokens,
  resetTimestamp,
  stats,
}) => {
  const [countdownSec, setCountdownSec] = useState<number>(60);

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.max(0, Math.ceil((resetTimestamp - Date.now()) / 1000));
      setCountdownSec(diff);
    }, 1000);
    return () => clearInterval(timer);
  }, [resetTimestamp]);

  const pct = currentLimit > 0
    ? Math.min(100, Math.max(0, (remainingTokens / currentLimit) * 100))
    : 0;

  let fluidColorClass = 'cyan';
  if (remainingTokens === 0) fluidColorClass = 'depleted';
  else if (pct < 30) fluidColorClass = 'warning';

  const consumed = Math.max(0, currentLimit - remainingTokens);
  const consumedPct = currentLimit > 0 ? (consumed / currentLimit) * 100 : 0;
  const countdownBarPct = Math.min(100, Math.max(0, (countdownSec / 60) * 100));

  const sortedLatencies = [...stats.latencies].sort((a, b) => a - b);
  const p95 = sortedLatencies.length > 0
    ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || sortedLatencies[sortedLatencies.length - 1]
    : 0;

  return (
    <div className="glass-panel">
      <div className="panel-head">
        <div className="panel-title-area">
          <div className="panel-icon-wrap" style={{ background: 'var(--emerald-subtle)', color: 'var(--emerald)' }}>
            <Waves size={18} color="#34C98A" />
          </div>
          <div>
            <h2>Token Bucket State</h2>
            <p>Live token count · Lua atomic refill via Redis</p>
          </div>
        </div>
        <div className="telemetry-chip">
          <Sparkles size={12} color="#E082B8" />
          <span className="chip-value" style={{ color: 'var(--emerald)' }}>LIVE</span>
        </div>
      </div>

      <div className="visualizer-container-inner">
        {/* Dynamic Glass Wave Chamber */}
        <div className="fluid-chamber-wrap">
          <div className="chamber-structure">
            <div
              className={`chamber-fluid ${fluidColorClass}`}
              style={{ height: `${pct}%` }}
            >
              <div className="fluid-wave-surface" />
              <div className="energy-particles-overlay" />
            </div>

            <div className="chamber-metrics-overlay">
              <span className="token-huge-number">{remainingTokens}</span>
              <span className="token-total-caption">/ {currentLimit} tokens</span>
            </div>
          </div>
          <span className="chamber-sub-status">
            {remainingTokens === 0
              ? '⚠️ BUCKET EXHAUSTED (429 Active)'
              : 'Redis Lua refill active'}
          </span>
        </div>

        {/* Meters & Telemetry Gauges Stack */}
        <div className="gauges-metrics-stack">
          {/* Capacity Consumed Meter */}
          <div className="meter-block">
            <div className="meter-header-row">
              <span className="meter-title">Capacity Consumed</span>
              <span className="meter-reading">{consumed} / {currentLimit} req</span>
            </div>
            <div className="bar-track">
              <div
                className="bar-progress-fill cyan-grad"
                style={{ width: `${consumedPct}%` }}
              />
            </div>
          </div>

          {/* Window Countdown Meter */}
          <div className="meter-block">
            <div className="meter-header-row">
              <span className="meter-title">Refill Window Reset</span>
              <span className="meter-reading">{countdownSec}s remaining</span>
            </div>
            <div className="countdown-hero-display">
              <span className="countdown-big-num">{countdownSec}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>seconds</span>
            </div>
            <div className="bar-track" style={{ height: '4px' }}>
              <div
                className="bar-progress-fill solid-cyan"
                style={{ width: `${countdownBarPct}%` }}
              />
            </div>
          </div>

          {/* Mini Stats Grid */}
          <div className="mini-stats-grid">
            <div className="mini-stat-cell">
              <span className="label">Total Ingress</span>
              <span className="val">{stats.total}</span>
            </div>
            <div className="mini-stat-cell">
              <span className="label">Passed (200)</span>
              <span className="val val-green">{stats.allowed}</span>
            </div>
            <div className="mini-stat-cell">
              <span className="label">Denied (429)</span>
              <span className="val val-red">{stats.blocked}</span>
            </div>
            <div className="mini-stat-cell">
              <span className="label">p95 Latency</span>
              <span className="val val-cyan">{p95 > 0 ? `${p95}ms` : '<1ms'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
