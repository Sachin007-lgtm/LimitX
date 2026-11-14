import React, { useState } from 'react';
import type { RequestRecord } from '../types';
import { Eye, Copy, Check, Terminal } from 'lucide-react';

interface HeadersInspectorProps {
  selectedRecord: RequestRecord | null;
}

export const HeadersInspector: React.FC<HeadersInspectorProps> = ({ selectedRecord }) => {
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const curlCommand = selectedRecord
    ? `curl -i -X ${selectedRecord.method} \\\n  -H "X-API-Key: ${(selectedRecord.payload.clientId as string) || 'client-alpha'}" \\\n  http://localhost:3000${selectedRecord.path}`
    : 'curl -i http://localhost:3000/api/hello';

  const handleCopyJson = () => {
    if (!selectedRecord) return;
    navigator.clipboard.writeText(JSON.stringify(selectedRecord.payload, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 1500);
  };

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(curlCommand);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 1500);
  };

  const is200 = selectedRecord?.statusCode === 200;
  const is429 = selectedRecord?.statusCode === 429;

  return (
    <div className="glass-panel">
      <div className="panel-head">
        <div className="panel-title-area">
          <div className="panel-icon-wrap" style={{ background: 'var(--cyan-subtle)', color: 'var(--cyan)' }}>
            <Eye size={18} />
          </div>
          <div>
            <h2>Response Inspector</h2>
            <p>Rate limit headers and response payload</p>
          </div>
        </div>
        <div className="telemetry-chip">
          <span
            className={`status-tag ${
              is200 ? 'ok' : is429 ? 'blocked' : ''
            }`}
          >
            {selectedRecord
              ? `${selectedRecord.statusCode} ${
                  is200 ? 'OK' : is429 ? 'RATE LIMITED' : 'STATUS'
                }`
              : 'Select a request'}
          </span>
        </div>
      </div>

      <div className="inspector-content-wrap">
        {/* IETF Standard Headers Grid */}
        <div className="headers-matrix">
          <div className="header-card-tile">
            <span className="hdr-key">RateLimit-Limit</span>
            <span className="hdr-val">{selectedRecord ? selectedRecord.limit : '--'}</span>
          </div>

          <div className="header-card-tile">
            <span className="hdr-key">RateLimit-Remaining</span>
            <span className="hdr-val" style={{ color: is429 ? 'var(--rose)' : 'var(--cyan)' }}>
              {selectedRecord ? selectedRecord.remaining : '--'}
            </span>
          </div>

          <div className="header-card-tile">
            <span className="hdr-key">RateLimit-Reset</span>
            <span className="hdr-val">
              {selectedRecord && selectedRecord.resetTimestamp
                ? new Date(selectedRecord.resetTimestamp).toLocaleTimeString()
                : '--'}
            </span>
          </div>

          <div className="header-card-tile">
            <span className="hdr-key">X-RateLimit-Algorithm</span>
            <span className="hdr-val">{selectedRecord?.algorithm || '--'}</span>
          </div>

          <div className="header-card-tile">
            <span className="hdr-key">Retry-After</span>
            <span className="hdr-val" style={{ color: selectedRecord?.retryAfter ? 'var(--amber)' : 'inherit' }}>
              {selectedRecord?.retryAfter ? `${selectedRecord.retryAfter}s` : 'None'}
            </span>
          </div>

          <div className="header-card-tile">
            <span className="hdr-key">X-RateLimit-Degraded</span>
            <span className="hdr-val" style={{ color: selectedRecord?.degraded ? 'var(--amber)' : 'var(--emerald)' }}>
              {selectedRecord?.degraded ? 'true (Fail-Open)' : 'false'}
            </span>
          </div>
        </div>

        {/* Copyable cURL Command Box */}
        <div className="curl-snippet-card">
          <div className="snippet-top-bar">
            <span>
              <Terminal size={11} style={{ display: 'inline', marginRight: 4 }} />
              TERMINAL EQUIVALENT (CURL)
            </span>
            <button className="btn-copy-code" onClick={handleCopyCurl}>
              {copiedCurl ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedCurl ? 'Copied' : 'Copy cURL'}</span>
            </button>
          </div>
          <pre className="snippet-body">{curlCommand}</pre>
        </div>

        {/* JSON Response Body */}
        <div className="curl-snippet-card">
          <div className="snippet-top-bar">
            <span>SERVER JSON RESPONSE</span>
            <button className="btn-copy-code" onClick={handleCopyJson}>
              {copiedJson ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
            </button>
          </div>
          <pre className="snippet-body" style={{ color: '#cbd5e1' }}>
            {selectedRecord
              ? JSON.stringify(selectedRecord.payload, null, 2)
              : '/* Click any request in the stream to inspect response body */'}
          </pre>
        </div>
      </div>
    </div>
  );
};
