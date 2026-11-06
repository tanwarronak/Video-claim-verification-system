import React from "react";
import { Clock, Globe, AlignLeft, CheckCircle2 } from "lucide-react";

export function TranscriptViewer({ transcriptData, onTranscriptChange }) {
  if (!transcriptData) return null;

  const { text, duration, language, languageProbability, segments = [] } = transcriptData;

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
          {typeof languageProbability === "number" && (
            <div className="meta-item">
              <span>Language detection: {Math.round(languageProbability * 100)}%</span>
            </div>
          )}
          <div className="meta-item">
            <AlignLeft size={16} />
            <span>{segments.length} Segments</span>
          </div>
        </div>
      </div>

      {typeof languageProbability === "number" && languageProbability < 0.6 && (
        <div className="transcript-warning" role="status">
          Language detection confidence is low. Review the transcript carefully; for another run,
          specify the spoken language before uploading.
        </div>
      )}

      {text && (
        <div>
          <h4 style={{ color: "var(--text-secondary)", marginBottom: "0.5rem", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Full Transcript
          </h4>
          <div className="full-text-box">{text}</div>
        </div>
      )}

      <h4 style={{ color: "var(--text-secondary)", marginBottom: "0.75rem", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Review and correct the timestamped transcript before extracting claims
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
              <textarea
                className="segment-text-input"
                value={seg.text}
                onChange={(event) => {
                  const updatedSegments = segments.map((segment, segmentIndex) =>
                    segmentIndex === idx ? { ...segment, text: event.target.value } : segment
                  );
                  onTranscriptChange?.(updatedSegments);
                }}
                aria-label={`Transcript segment ${idx + 1}`}
                rows={Math.max(2, Math.ceil((seg.text?.length || 1) / 80))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
