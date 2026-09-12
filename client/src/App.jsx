import React, { useState } from "react";
import { VideoUploader } from "./components/VideoUploader";
import { TranscriptViewer } from "./components/TranscriptViewer";

export function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [transcriptResult, setTranscriptResult] = useState(null);

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    setError(null);
    setTranscriptResult(null);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setError(null);
    setTranscriptResult(null);
  };

  const handleTranscribe = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("video", selectedFile);

    try {
      const response = await fetch("/api/videos/transcribe", {
        method: "POST",
        body: formData,
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(
          json.error?.message || `Transcription failed with status ${response.status}`
        );
      }

      setTranscriptResult(json.data.transcript);
    } catch (err) {
      console.error("Transcription error:", err);
      setError(err.message || "Failed to transcribe video. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <span className="header-badge">Phase 1 Implementation</span>
        <h1>AI Video Claim Verification System</h1>
        <p>
          Extract speech and generate precision timestamped transcripts for claim verification.
        </p>
      </header>

      <main>
        <VideoUploader
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          onClearFile={handleClearFile}
          onSubmit={handleTranscribe}
          loading={loading}
          error={error}
        />

        <TranscriptViewer transcriptData={transcriptResult} />
      </main>
    </div>
  );
}

export default App;
