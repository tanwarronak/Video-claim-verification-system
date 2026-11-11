import React, { useEffect, useState } from "react";
import { VideoUploader } from "./components/VideoUploader";
import { TranscriptViewer } from "./components/TranscriptViewer";
import { ClaimViewer } from "./components/ClaimViewer";
import { Sparkles, FileText, CheckCircle } from "lucide-react";

export function App() {
  const [page, setPage] = useState(window.location.pathname === "/simple-check" ? "simple" : "detailed");
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [transcriptionLanguage, setTranscriptionLanguage] = useState("");
  const [error, setError] = useState(null);
  const [claimsError, setClaimsError] = useState(null);
  const [transcriptResult, setTranscriptResult] = useState(null);
  const [claimsResult, setClaimsResult] = useState(null);

  useEffect(() => {
    const handlePopState = () => {
      setPage(window.location.pathname === "/simple-check" ? "simple" : "detailed");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateToPage = (nextPage) => {
    const nextPath = nextPage === "simple" ? "/simple-check" : "/";
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setPage(nextPage);
  };

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    setTranscriptionLanguage("");
    setError(null);
    setClaimsError(null);
    setTranscriptResult(null);
    setClaimsResult(null);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setTranscriptionLanguage("");
    setError(null);
    setClaimsError(null);
    setTranscriptResult(null);
    setClaimsResult(null);
  };

  const extractClaims = async (transcript) => {
    setClaimsLoading(true);
    setClaimsError(null);
    setClaimsResult(null);

    try {
      const response = await fetch("/api/claims/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transcript }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        const message =
          json.error?.message || `Claim extraction failed with status ${response.status}`;
        throw new Error(
          json.error?.code ? `${message} (${json.error.code})` : message
        );
      }

      setClaimsResult(json.data);
    } catch (err) {
      console.error("Claim extraction error:", err);
      setClaimsError(err.message || "Failed to extract claims. Please try again.");
    } finally {
      setClaimsLoading(false);
    }
  };

  const handleTranscribe = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setError(null);
    setClaimsError(null);
    setClaimsResult(null);

    const formData = new FormData();
    formData.append("video", selectedFile);
    if (transcriptionLanguage.trim()) {
      formData.append("language", transcriptionLanguage.trim().toLowerCase());
    }

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
      await extractClaims(json.data.transcript);
    } catch (err) {
      console.error("Transcription error:", err);
      setError(err.message || "Failed to transcribe video. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleExtractClaims = async () => {
    if (!transcriptResult) return;
    await extractClaims(transcriptResult);
  };

  return (
    <div className="container">
      <nav className="page-navigation" aria-label="Choose analysis view">
        <button
          type="button"
          className={page === "simple" ? "active" : ""}
          onClick={() => navigateToPage("simple")}
        >
          Quick fact-check
        </button>
        <button
          type="button"
          className={page === "detailed" ? "active" : ""}
          onClick={() => navigateToPage("detailed")}
        >
          Detailed workspace
        </button>
      </nav>

      <header className="header">
        <span className="header-badge">
          {page === "simple" ? "Quick fact-check" : "Video Claim Verification System"}
        </span>
        <h1>{page === "simple" ? "Is this video accurate?" : "AI Video Claim Verification"}</h1>
        <p>
          {page === "simple"
            ? "Upload a video to find checkable claims, review evidence for and against them, and see a clear result."
            : "Analyze spoken claims from video, extract timestamped statements, and classify them into verifiable propositions, opinions, predictions, and non-claims."}
        </p>
      </header>

      <main>
        {/* Video Uploader (Phase 1) */}
        <VideoUploader
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          onClearFile={handleClearFile}
          onSubmit={handleTranscribe}
          loading={loading}
          error={error}
          transcriptionLanguage={transcriptionLanguage}
          onTranscriptionLanguageChange={setTranscriptionLanguage}
        />

        {page === "detailed" && (
          <TranscriptViewer
            transcriptData={transcriptResult}
            onTranscriptChange={(updatedSegments) => {
              setTranscriptResult((current) => ({
                ...current,
                segments: updatedSegments,
                text: updatedSegments.map((segment) => segment.text).join(" "),
              }));
              setClaimsResult(null);
              setClaimsError(null);
            }}
          />
        )}

        {/* Phase 2 Action Trigger Bar */}
        {page === "detailed" && transcriptResult && (
          <div className="action-bar-card">
            <div className="action-bar-info">
              <div className="action-bar-icon">
                <CheckCircle size={20} color="#10b981" />
              </div>
              <div>
                <h3>{claimsLoading ? "Extracting claims..." : "Transcript ready"}</h3>
                <p>
                  {claimsLoading
                    ? "The transcript is being analyzed. Evidence search and verification will start automatically."
                    : "Claims are extracted automatically after transcription. Re-run after editing the transcript."}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-extract"
              onClick={handleExtractClaims}
              disabled={claimsLoading}
            >
              {claimsLoading ? (
                <>
                  <div className="spinner" />
                  <span>Extracting Claims...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>{claimsResult ? "Re-extract Claims" : "Extract & Classify Claims"}</span>
                </>
              )}
            </button>
          </div>
        )}

        {page === "simple" && transcriptResult && claimsLoading && (
          <div className="quick-processing" role="status">
            <div className="spinner" />
            <div>
              <strong>Finding claims in your video</strong>
              <p>We will search for evidence and check the claims as soon as they are extracted.</p>
            </div>
          </div>
        )}

        {/* Claims Extraction Error */}
        {claimsError && (
          <div className="error-banner">
            <span>{claimsError}</span>
          </div>
        )}

        {/* Claims View (Phase 2 Output) */}
        {claimsResult && (
          <ClaimViewer
            claimsData={claimsResult}
            videoFile={selectedFile}
            viewMode={page}
          />
        )}

      </main>
    </div>
  );
}

export default App;
