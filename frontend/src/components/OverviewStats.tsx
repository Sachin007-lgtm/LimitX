import React from 'react';
import type { Stats } from '../types';
import { Gauge, CheckCircle2, Clock, Activity } from 'lucide-react';

interface OverviewStatsProps {
  currentLimit: number;
  remainingTokens: number;
  resetTimestamp: number;
  stats: Stats;
}

export const OverviewStats: React.FC<OverviewStatsProps> = ({
  currentLimit,
  remainingTokens,
  resetTimestamp,
  stats,
}) => {
  const [countdown, setCountdown] = React.useState(60);

  React.useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.max(0, Math.ceil((resetTimestamp - Date.now()) / 1000));
      setCountdown(diff);
    }, 1000);
    return () => clearInterval(timer);
  }, [resetTimestamp]);

  const sortedLatencies = [...stats.latencies].sort((a, b) => a - b);
  const p95 = sortedLatencies.length > 0
    ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || sortedLatencies[sortedLatencies.length - 1]
    : 0;

  const successRate = stats.total > 0
    ? Math.round((stats.allowed / stats.total) * 100)
    : 100;

  return (
    <div className="stats-overview-grid">
      <div className="stat-kpi-card cyan">
        <div className="kpi-info-col">
          <span className="kpi-title">Remaining Capacity</span>
          <span className="kpi-value">{remainingTokens}</span>
          <span className="kpi-subtext">out of {currentLimit} tokens allocated</span>
        </div>
        <div className="kpi-icon-bubble">
          <Gauge size={22} color="#E082B8" />
        </div>
      </div>

      <div className="stat-kpi-card emerald">
        <div className="kpi-info-col">
          <span className="kpi-title">Allowance Rate</span>
          <span className="kpi-value">{successRate}%</span>
          <span className="kpi-subtext">{stats.allowed} allowed / {stats.blocked} blocked</span>
        </div>
        <div className="kpi-icon-bubble">
          <CheckCircle2 size={22} color="#34C98A" />
        </div>
      </div>

      <div className="stat-kpi-card purple">
        <div className="kpi-info-col">
          <span className="kpi-title">Window Reset</span>
          <span className="kpi-value">{countdown}s</span>
          <span className="kpi-subtext">token window resets</span>
        </div>
        <div className="kpi-icon-bubble">
          <Clock size={22} color="#C599F2" />
        </div>
      </div>

      <div className="stat-kpi-card rose">
        <div className="kpi-info-col">
          <span className="kpi-title">Latency (p95)</span>
          <span className="kpi-value">{p95 > 0 ? `${p95}ms` : '< 1ms'}</span>
          <span className="kpi-subtext">gateway round-trip</span>
        </div>
        <div className="kpi-icon-bubble">
          <Activity size={22} color="#F45B7A" />
        </div>
      </div>
    </div>
  );
};
