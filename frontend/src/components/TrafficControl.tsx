import React from 'react';
import { Sliders, RotateCcw, Zap, Rocket, Flame, Bomb, Key } from 'lucide-react';

interface TrafficControlProps {
  clientKey: string;
  setClientKey: (val: string) => void;
  tier: string;
  setTier: (val: string) => void;
  routePreset: string;
  setRoutePreset: (val: string) => void;
  currentLimit: number;
  onFireSingle: () => void;
  onFireBurst5: () => void;
  onFireBurst20: () => void;
  onFireFlood: () => void;
  autoSpam: boolean;
  setAutoSpam: (val: boolean) => void;
  spammerRate: number;
  setSpammerRate: (val: number) => void;
  onResetQuota: () => void;
  isActionLoading: boolean;
}

export const TrafficControl: React.FC<TrafficControlProps> = ({
  clientKey,
  setClientKey,
  tier,
  setTier,
  routePreset,
  setRoutePreset,
  onFireSingle,
  onFireBurst5,
  onFireBurst20,
  onFireFlood,
  autoSpam,
  setAutoSpam,
  spammerRate,
  setSpammerRate,
  onResetQuota,
  isActionLoading,
}) => {
  const presets = [
    { id: 'client-alpha', label: 'alpha' },
    { id: 'client-beta', label: 'beta' },
    { id: 'mobile-app-v2', label: 'mobile-v2' },
  ];

  const handleTabChange = (targetPreset: string) => {
    setRoutePreset(targetPreset);
  };

  return (
    <div className="glass-panel">
      <div className="panel-head">
        <div className="panel-title-area">
          <div className="panel-icon-wrap">
            <Sliders size={18} />
          </div>
          <div>
            <h2>Request Builder</h2>
            <p>Configure and fire HTTP requests against the rate-limited gateway</p>
          </div>
        </div>
        <button
          id="btn-reset-quota"
          className="telemetry-chip"
          style={{ cursor: 'pointer' }}
          title="Clear Redis keys for current client"
          onClick={onResetQuota}
          disabled={isActionLoading}
        >
          <RotateCcw size={12} color="#E082B8" />
          <span className="chip-value">Reset Quota</span>
        </button>
      </div>

      <div className="traffic-console-body">
        {/* Algorithm Segmented Tab Bar */}
        <div className="algo-segmented-bar">
          <button
            type="button"
            className={`algo-tab-btn ${
              routePreset === 'GET:/api/hello' ? 'active' : ''
            }`}
            onClick={() => handleTabChange('GET:/api/hello')}
          >
            <span>Token Bucket</span>
            <span className="tab-sub">100 req &middot; Smooth Refill</span>
          </button>

          <button
            type="button"
            className={`algo-tab-btn ${
              routePreset === 'POST:/auth/login' ? 'active' : ''
            }`}
            onClick={() => handleTabChange('POST:/auth/login')}
          >
            <span>Fixed Window</span>
            <span className="tab-sub">5 req &middot; Auth Guard</span>
          </button>

          <button
            type="button"
            className={`algo-tab-btn ${
              routePreset === 'GET:/api/v1/search' ? 'active' : ''
            }`}
            onClick={() => handleTabChange('GET:/api/v1/search')}
          >
            <span>Sliding Window</span>
            <span className="tab-sub">30 req &middot; Exact ZSET</span>
          </button>
        </div>

        {/* Client Identity Picker */}
        <div className="client-picker-area">
          <div className="input-label-row">
            <label>
              <Key size={12} style={{ display: 'inline', marginRight: 4 }} />
              Client Identity (X-API-Key)
            </label>
            <span className="desc">Isolates Redis state per client</span>
          </div>
          <div className="client-pills-row">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`client-pill-btn ${clientKey === p.id ? 'active' : ''}`}
                onClick={() => setClientKey(p.id)}
              >
                <span>{p.label}</span>
              </button>
            ))}
            <input
              type="text"
              value={clientKey}
              onChange={(e) => setClientKey(e.target.value)}
              placeholder="Or type custom key..."
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-full)',
                padding: '6px 14px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
                outline: 'none',
                flex: 1,
                minWidth: '130px',
              }}
            />
          </div>
        </div>

        {/* Tier & Route Dropdowns */}
        <div className="inputs-double-row">
          <div className="custom-select-wrap">
            <div className="input-label-row" style={{ marginBottom: 6 }}>
              <label>Tier Policy Override</label>
            </div>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
            >
              <option value="">Standard Policy (Default)</option>
              <option value="free">Free Tier (20 req / 60s)</option>
              <option value="pro">Pro Tier (500 req / 60s)</option>
              <option value="internal">Internal Service (10,000 req / 60s)</option>
            </select>
          </div>

          <div className="custom-select-wrap">
            <div className="input-label-row" style={{ marginBottom: 6 }}>
              <label>Target API Route</label>
            </div>
            <select
              value={routePreset}
              onChange={(e) => setRoutePreset(e.target.value)}
            >
              <option value="GET:/api/hello">GET /api/hello (Default Token Bucket)</option>
              <option value="POST:/auth/login">POST /auth/login (Fixed Window &middot; 5 req)</option>
              <option value="GET:/api/v1/search">GET /api/v1/search (Sliding Window Log &middot; 30 req)</option>
              <option value="POST:/webhooks/event">POST /webhooks/event (Token Bucket &middot; 1 req/s refill)</option>
            </select>
          </div>
        </div>

        {/* Firing Action Matrix */}
        <div className="actions-matrix-wrap">
          <div className="input-label-row">
            <label>Fire Requests</label>
            <span className="desc">Concurrent requests sent in parallel</span>
          </div>

          <div className="firing-buttons-grid">
            <button
              id="btn-fire-single"
              className="action-trigger-btn btn-single"
              onClick={onFireSingle}
              disabled={isActionLoading}
            >
              <Zap size={18} color="#E082B8" />
              <span className="btn-main-label">Single</span>
              <span className="btn-badge-label">1 req</span>
            </button>

            <button
              id="btn-fire-burst-5"
              className="action-trigger-btn btn-burst5"
              onClick={onFireBurst5}
              disabled={isActionLoading}
            >
              <Rocket size={18} color="#C599F2" />
              <span className="btn-main-label">Rapid Burst</span>
              <span className="btn-badge-label">5 concurrent</span>
            </button>

            <button
              id="btn-fire-burst-20"
              className="action-trigger-btn btn-burst20"
              onClick={onFireBurst20}
              disabled={isActionLoading}
            >
              <Flame size={18} color="#F5A623" />
              <span className="btn-main-label">Stress Load</span>
              <span className="btn-badge-label">20 concurrent</span>
            </button>

            <button
              id="btn-fire-flood"
              className="action-trigger-btn btn-flood"
              onClick={onFireFlood}
              disabled={isActionLoading}
            >
              <Bomb size={18} color="#F45B7A" />
              <span className="btn-main-label">Flood & Drain</span>
              <span className="btn-badge-label">Exhaust to 429</span>
            </button>
          </div>

          {/* Continuous Spammer Console */}
          <div className="spammer-stream-panel">
            <div className="spammer-top-row">
              <label htmlFor="check-auto-spam" className="spammer-switch-label">
                <input
                  type="checkbox"
                  id="check-auto-spam"
                  checked={autoSpam}
                  onChange={(e) => setAutoSpam(e.target.checked)}
                />
                <span className="toggle-track" />
                <span>Auto-fire</span>
              </label>
              <span className="spammer-rate-badge">
                {spammerRate} req / sec
              </span>
            </div>
            <input
              type="range"
              className="rate-range-slider"
              min={1}
              max={25}
              value={spammerRate}
              disabled={!autoSpam}
              onChange={(e) => setSpammerRate(parseInt(e.target.value, 10))}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
