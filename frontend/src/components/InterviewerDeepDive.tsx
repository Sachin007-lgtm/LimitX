import React, { useState } from 'react';
import { ChevronDown, Cpu, GitCommit, Network } from 'lucide-react';

export const InterviewerDeepDive: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <section className="interviewer-accordion-card">
      <button
        type="button"
        className="accordion-header-btn"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="panel-title-area">
          <div className="panel-icon-wrap" style={{ background: 'var(--amber-subtle)', color: 'var(--amber)' }}>
            <Cpu size={18} />
          </div>
          <div>
            <h2>Distributed Engineering Dossier (Interviewer Technical Guide)</h2>
            <p>How LimitX solves race conditions, ensures atomicity, and degrades gracefully</p>
          </div>
        </div>
        <span
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ChevronDown size={20} color="#94a3b8" />
        </span>
      </button>

      {isOpen && (
        <div className="accordion-body-grid">
          {/* Section 1 */}
          <div className="deep-dive-card-item">
            <h3>
              <Cpu size={16} color="#06b6d4" />
              1. TOCTOU Race Conditions & Lua
            </h3>
            <p>
              In distributed systems, a naive <code>GET tokens &rarr; check &rarr; SET tokens</code> allows concurrent requests to interleave and read stale counters, permitting bursts beyond the limit.
            </p>
            <div className="lua-preview-box">
              <pre>
                <code>{`-- Atomic Redis Lua single thread:
local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local elapsed = (now_ms - last_refill) / 1000
local tokens = math.min(capacity, current + elapsed * rate)
if tokens >= 1 then
  redis.call('HMSET', key, 'tokens', tokens - 1, 'last_refill', now_ms)
  return {1, tokens - 1, reset_ms}
else
  return {0, 0, reset_ms}
end`}</code>
              </pre>
            </div>
          </div>

          {/* Section 2 */}
          <div className="deep-dive-card-item">
            <h3>
              <GitCommit size={16} color="#f59e0b" />
              2. Algorithm Tradeoff Analysis
            </h3>
            <p>
              <strong>Token Bucket (Default):</strong> Stores <code>[tokens, last_refill]</code> in a Redis hash. Allows short controlled bursts while maintaining smooth long-term average. Minimal memory footprint.
            </p>
            <p>
              <strong>Sliding Window Log:</strong> Redis Sorted Set (<code>ZSET</code>) scored by timestamps. Trims entries older than <code>now - window</code>. Zero boundary burst bug, exact microsecond precision, but O(limit) memory.
            </p>
            <p>
              <strong>Fixed Window:</strong> <code>INCR + EXPIRE</code>. Demonstrates why naive counters suffer from the 2x boundary burst vulnerability.
            </p>
          </div>

          {/* Section 3 */}
          <div className="deep-dive-card-item">
            <h3>
              <Network size={16} color="#8b5cf6" />
              3. Multi-Node Global Sync
            </h3>
            <p>
              In production, multiple gateway instances (e.g. <code>gateway-1:3000</code> and <code>gateway-2:3001</code> behind Nginx) share the same Redis instance. A client making alternating requests across nodes has their quota enforced globally.
            </p>
            <p>
              <strong>Graceful Degradation:</strong> If Redis becomes unreachable, the gateway enters degraded mode based on <code>REDIS_FAIL_STRATEGY</code>:
              <br />
              &bull; <code>fail-open</code>: Allows requests through with <code>X-RateLimit-Degraded: true</code> header to prioritize availability.
              <br />
              &bull; <code>fail-closed</code>: Returns 429 for security-critical endpoints.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
