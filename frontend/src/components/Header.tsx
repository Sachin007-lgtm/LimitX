import React from 'react';
import type { ClusterHealth, NodeInfo } from '../types';
import { ShieldCheck, Server, Database, Radio } from 'lucide-react';

interface HeaderProps {
  health: ClusterHealth;
  nodeInfo: NodeInfo | null;
}

export const Header: React.FC<HeaderProps> = ({ health, nodeInfo }) => {
  return (
    <header className="top-navbar">
      <div className="top-navbar-inner">
        <div className="brand-wrapper">
          <div className="brand-shield-icon">
            <ShieldCheck size={22} strokeWidth={2.4} />
          </div>
          <div className="brand-text">
            <h1>LimitX</h1>
            <span className="pill-version">v1.0</span>
          </div>
        </div>

        {/* Real-time Cluster Telemetry Strip */}
        <div className="cluster-telemetry-strip">
          <div className="telemetry-chip">
            <Radio size={13} color="#E082B8" />
            <span className="chip-label">Gateway</span>
            <span className="status-dot-pulse green" />
            <span className="chip-value">
              {health.gatewayStatus === 'online'
                ? 'Online'
                : health.gatewayStatus === 'degraded'
                ? `Degraded (${health.failStrategy})`
                : 'Offline'}
            </span>
          </div>

          <div className="telemetry-chip">
            <Database size={13} color="#34C98A" />
            <span className="chip-label">Redis</span>
            <span
              className={`status-dot-pulse ${
                health.redisConnected ? 'green' : 'red'
              }`}
            />
            <span className="chip-value">
              {health.redisConnected ? 'Synchronized' : 'Disconnected'}
            </span>
          </div>

          <div className="telemetry-chip">
            <Server size={13} color="#C599F2" />
            <span className="chip-label">Node</span>
            <span className="chip-value">{nodeInfo?.instanceId ?? 'gateway-primary'}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
