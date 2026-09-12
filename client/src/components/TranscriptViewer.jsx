import React from "react";
import { Clock, Globe, AlignLeft, CheckCircle2 } from "lucide-react";

export function TranscriptViewer({ transcriptData }) {
  if (!transcriptData) return null;

  const { text, duration, language, segments = [] } = transcriptData;

  const formatTime = (seconds) => {
    if (seconds == null || isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="card">
      <div className="results-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <CheckCircle2 color="#10b981" size={22} />
          <h2>Timestamped Transcript</h2>
        </div>
        <div className="results-meta">
          <div className="meta-item">
            <Clock size={16} />
            <span>Duration: {formatTime(duration)}</span>
          </div>
          <div className="meta-item">
            <Globe size={16} />
            <span>Language: {language?.toUpperCase() || "AUTO"}</span>
          </div>
          <div className="meta-item">
            <AlignLeft size={16} />
            <span>{segments.length} Segments</span>
          </div>
        </div>
      </div>

      {text && (
        <div>
          <h4 style={{ color: "var(--text-secondary)", marginBottom: "0.5rem", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Full Transcript
          </h4>
          <div className="full-text-box">{text}</div>
        </div>
      )}

      <h4 style={{ color: "var(--text-secondary)", marginBottom: "0.75rem", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Timestamped Segments
      </h4>

      {segments.length === 0 ? (
        <div className="empty-segments">
          No speech detected in the uploaded video.
        </div>
      ) : (
        <div className="segments-list">
          {segments.map((seg, idx) => (
            <div key={seg.id ?? idx} className="segment-card">
              <div className="timestamp-badge">
                {formatTime(seg.start)} - {formatTime(seg.end)}
              </div>
              <div className="segment-text">{seg.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
