import React from 'react';
import type { RequestRecord } from '../types';
import { Terminal, Trash2 } from 'lucide-react';

interface LiveStreamTableProps {
  requests: RequestRecord[];
  selectedId: string | null;
  onSelect: (record: RequestRecord) => void;
  onClear: () => void;
}

export const LiveStreamTable: React.FC<LiveStreamTableProps> = ({
  requests,
  selectedId,
  onSelect,
  onClear,
}) => {
  return (
    <div className="glass-panel">
      <div className="panel-head">
        <div className="panel-title-area">
          <div className="panel-icon-wrap" style={{ background: 'var(--purple-subtle)', color: 'var(--purple)' }}>
            <Terminal size={18} />
          </div>
          <div>
            <h2>Request Log</h2>
            <p>Live feed of requests and rate limit decisions</p>
          </div>
        </div>
        <button
          id="btn-clear-logs"
          className="telemetry-chip"
          style={{ cursor: 'pointer' }}
          onClick={onClear}
        >
          <Trash2 size={12} color="#94a3b8" />
          <span className="chip-value">Clear Log</span>
        </button>
      </div>

      <div className="table-scroll-container">
        <table className="modern-stream-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Endpoint</th>
              <th>Decision Status</th>
              <th>Latency</th>
              <th>Tokens Left</th>
              <th>Inspect</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }}>
                  No traffic captured yet. Fire requests above or enable Continuous Load to observe stream.
                </td>
              </tr>
            ) : (
              requests.map((r) => {
                const is200 = r.statusCode === 200;
                const is429 = r.statusCode === 429;

                return (
                  <tr
                    key={r.id}
                    className={selectedId === r.id ? 'active-row' : ''}
                    onClick={() => onSelect(r)}
                  >
                    <td>{r.time}</td>
                    <td>
                      <span
                        style={{
                          background: r.method === 'GET' ? 'rgba(224, 130, 184, 0.12)' : 'rgba(245, 166, 35, 0.12)',
                          color: r.method === 'GET' ? 'var(--cyan)' : 'var(--amber)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 700,
                          marginRight: 6,
                        }}
                      >
                        {r.method}
                      </span>
                      <strong>{r.path}</strong>
                    </td>
                    <td>
                      <span
                        className={`status-tag ${
                          is200 ? 'ok' : is429 ? 'blocked' : 'error'
                        }`}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: is200 ? 'var(--emerald)' : 'var(--rose)',
                          }}
                        />
                        {r.statusCode} {is200 ? 'OK' : is429 ? '429 TOO MANY' : 'ERR'}
                      </span>
                    </td>
                    <td>{r.durationMs}ms</td>
                    <td>
                      <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>
                        {r.remaining}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                        View &rarr;
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
