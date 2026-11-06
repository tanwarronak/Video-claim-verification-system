import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Sparkles,
  Search,
  Filter,
  Layers,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  MinusCircle,
  FileText,
  Info,
  Globe,
  ExternalLink,
  Clock,
  AlertTriangle,
  Loader2,
  Shield,
  Scale,
  CheckCircle,
  XCircle,
  AlertCircle,
  Brain,
  Play,
} from "lucide-react";
import { ClaimBadge } from "./ClaimBadge";

export function ClaimViewer({ claimsData, videoFile, viewMode = "detailed" }) {
  const [selectedCategory, setSelectedCategory] = useState("FACTUAL");
  const [searchQuery, setSearchQuery] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  const [evidenceLoading, setEvidenceLoading] = useState({});
  const [evidenceData, setEvidenceData] = useState({});
  const [evidenceErrors, setEvidenceErrors] = useState({});
  const [verdictLoading, setVerdictLoading] = useState({});
  const [verdictData, setVerdictData] = useState({});
  const [verdictErrors, setVerdictErrors] = useState({});
  const videoRef = useRef(null);
  const clipEndRef = useRef(null);

  const { claims = [], summary = {} } = claimsData || {};

  useEffect(() => {
    if (!videoFile) {
      setVideoUrl("");
      return undefined;
    }

    const url = URL.createObjectURL(videoFile);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  const formatTime = (seconds) => {
    if (seconds == null || isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const formatDate = (isoString) => {
    if (!isoString) return "Unknown date";
    try {
      return new Date(isoString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Invalid date";
    }
  };

  const retrieveEvidence = useCallback(async (claim) => {
    if (claim.type !== "FACTUAL") return;
    if (evidenceLoading[claim.id]) return;
    if (evidenceData[claim.id]?.evidence?.length > 0) return;

    setEvidenceLoading((prev) => ({ ...prev, [claim.id]: true }));
    setEvidenceErrors((prev) => ({ ...prev, [claim.id]: null }));

    try {
      const response = await fetch("/api/evidence/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claims: [
            {
              claimId: claim.id,
              text: claim.originalText,
              normalizedText: claim.normalizedText,
              category: claim.type,
              startTime: claim.startTime,
              endTime: claim.endTime,
              sourceSegmentIds: claim.sourceSegmentIds,
              reason: claim.reason,
            },
          ],
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error?.message || `Evidence retrieval failed with status ${response.status}`);
      }

      const result = json.data.results[0];
      setEvidenceData((prev) => ({ ...prev, [claim.id]: result }));
    } catch (err) {
      console.error("Evidence retrieval error:", err);
      setEvidenceErrors((prev) => ({ ...prev, [claim.id]: err.message || "Failed to retrieve evidence" }));
    } finally {
      setEvidenceLoading((prev) => ({ ...prev, [claim.id]: false }));
    }
  }, [evidenceLoading, evidenceData]);

  const verifyClaim = useCallback(async (claim) => {
    if (claim.type !== "FACTUAL") return;
    const evidenceResult = evidenceData[claim.id];
    if (!evidenceResult || !evidenceResult.evidence || evidenceResult.evidence.length === 0) return;
    if (verdictLoading[claim.id]) return;
    if (verdictData[claim.id]) return;

    setVerdictLoading((prev) => ({ ...prev, [claim.id]: true }));
    setVerdictErrors((prev) => ({ ...prev, [claim.id]: null }));

    try {
      const response = await fetch("/api/nli/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claims: [
            {
              claimId: claim.id,
              text: claim.originalText,
              normalizedText: claim.normalizedText,
              category: claim.type,
              startTime: claim.startTime,
              endTime: claim.endTime,
              sourceSegmentIds: claim.sourceSegmentIds,
              reason: claim.reason,
              evidence: evidenceResult.evidence,
            },
          ],
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error?.message || `Verification failed with status ${response.status}`);
      }

      const result = json.data.results[0];
      setVerdictData((prev) => ({ ...prev, [claim.id]: result }));
    } catch (err) {
      console.error("Verification error:", err);
      setVerdictErrors((prev) => ({ ...prev, [claim.id]: err.message || "Failed to verify claim" }));
    } finally {
      setVerdictLoading((prev) => ({ ...prev, [claim.id]: false }));
    }
  }, [evidenceData, verdictLoading, verdictData]);

  useEffect(() => {
    let cancelled = false;
    const factualClaims = claims.filter((claim) => claim.type === "FACTUAL");

    setEvidenceData({});
    setEvidenceErrors({});
    setEvidenceLoading({});
    setVerdictData({});
    setVerdictErrors({});
    setVerdictLoading({});

    if (factualClaims.length === 0) return undefined;

    const toRequestClaim = (claim) => ({
      claimId: claim.id,
      text: claim.originalText,
      normalizedText: claim.normalizedText,
      category: claim.type,
      startTime: claim.startTime,
      endTime: claim.endTime,
      sourceSegmentIds: claim.sourceSegmentIds,
      reason: claim.reason,
    });

    const setLoadingFor = (items, setter, value) => {
      setter((previous) => ({
        ...previous,
        ...Object.fromEntries(items.map((claim) => [claim.id, value])),
      }));
    };

    const setErrorsFor = (items, setter, message) => {
      setter((previous) => ({
        ...previous,
        ...Object.fromEntries(items.map((claim) => [claim.id, message])),
      }));
    };

    setLoadingFor(factualClaims, setEvidenceLoading, true);

    async function retrieveAndVerify() {
      const evidenceByClaim = new Map();
      const batchSize = 1;

      for (let index = 0; index < factualClaims.length; index += batchSize) {
        const batch = factualClaims.slice(index, index + batchSize);
        setLoadingFor(batch, setEvidenceLoading, true);

        try {
          const response = await fetch("/api/evidence/retrieve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ claims: batch.map(toRequestClaim) }),
          });
          const json = await response.json();
          if (!response.ok || !json.success) {
            throw new Error(json.error?.message || `Evidence retrieval failed with status ${response.status}`);
          }

          const results = json.data.results || [];
          for (const result of results) {
            evidenceByClaim.set(result.claimId, result);
          }
          if (!cancelled) {
            setEvidenceData((previous) => ({
              ...previous,
              ...Object.fromEntries(results.map((result) => [result.claimId, result])),
            }));
            for (const claim of batch) {
              const result = results.find((item) => item.claimId === claim.id);
              if (!result) {
                setErrorsFor([claim], setEvidenceErrors, "Evidence service returned no result for this claim.");
              } else if (!result.evidence?.length) {
                const message = result.errors?.map((item) => item.message).filter(Boolean).join(" ") ||
                  "No sources were found for this claim.";
                setErrorsFor([claim], setEvidenceErrors, message);
              }
            }
          }
        } catch (err) {
          console.error("Evidence retrieval error:", err);
          if (!cancelled) {
            setErrorsFor(batch, setEvidenceErrors, err.message || "Failed to retrieve evidence.");
          }
        } finally {
          if (!cancelled) setLoadingFor(batch, setEvidenceLoading, false);
        }
      }

      const claimsWithEvidence = factualClaims.filter((claim) =>
        evidenceByClaim.get(claim.id)?.evidence?.length > 0
      );
      if (!cancelled) setLoadingFor(claimsWithEvidence, setVerdictLoading, true);

      for (let index = 0; index < claimsWithEvidence.length; index += 20) {
        const batch = claimsWithEvidence.slice(index, index + 20);

        try {
          const response = await fetch("/api/nli/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              claims: batch.map((claim) => ({
                ...toRequestClaim(claim),
                evidence: evidenceByClaim.get(claim.id).evidence,
              })),
            }),
          });
          const json = await response.json();
          if (!response.ok || !json.success) {
            throw new Error(json.error?.message || `Verification failed with status ${response.status}`);
          }

          if (!cancelled) {
            setVerdictData((previous) => ({
              ...previous,
              ...Object.fromEntries((json.data.results || []).map((result) => [result.claimId, result])),
            }));
          }
        } catch (err) {
          console.error("Verification error:", err);
          if (!cancelled) {
            setErrorsFor(batch, setVerdictErrors, err.message || "Failed to verify claims.");
          }
        } finally {
          if (!cancelled) setLoadingFor(batch, setVerdictLoading, false);
        }
      }
    }

    retrieveAndVerify();
    return () => {
      cancelled = true;
    };
  }, [claimsData]);

  const playClaimSegment = async (claim) => {
    const video = videoRef.current;
    if (!video) return;

    setPlaybackError("");
    clipEndRef.current = claim.endTime;
    video.currentTime = claim.startTime;
    try {
      await video.play();
    } catch (err) {
      console.error("Video playback failed:", err);
      setPlaybackError("This video could not be played in the browser.");
    }
  };

  const stopAtClaimEnd = () => {
    const video = videoRef.current;
    if (video && clipEndRef.current != null && video.currentTime >= clipEndRef.current) {
      video.pause();
      clipEndRef.current = null;
    }
  };

  const filteredClaims = useMemo(() => {
    return claims.filter((claim) => {
      const matchesCategory = selectedCategory === "ALL" || claim.type === selectedCategory;
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        claim.originalText?.toLowerCase().includes(query) ||
        claim.normalizedText?.toLowerCase().includes(query) ||
        claim.reason?.toLowerCase().includes(query) ||
        claim.id?.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [claims, selectedCategory, searchQuery]);

  const getVerdictIcon = (verdict) => {
    switch (verdict) {
      case "SUPPORTS":
        return <CheckCircle size={16} style={{ color: "#10b981" }} />;
      case "REFUTES":
        return <XCircle size={16} style={{ color: "#ef4444" }} />;
      case "NOT_ENOUGH_INFO":
      default:
        return <AlertCircle size={16} style={{ color: "#f59e0b" }} />;
    }
  };

  const getVerdictColor = (verdict) => {
    switch (verdict) {
      case "SUPPORTS":
        return "#10b981";
      case "REFUTES":
        return "#ef4444";
      case "NOT_ENOUGH_INFO":
      default:
        return "#f59e0b";
    }
  };

  const getVerdictLabel = (verdict) => {
    switch (verdict) {
      case "SUPPORTS":
        return "Supported";
      case "REFUTES":
        return "Refuted";
      case "NOT_ENOUGH_INFO":
      default:
        return "Inconclusive";
    }
  };

  const renderEvidenceSection = (claim) => {
    const loading = evidenceLoading[claim.id];
    const data = evidenceData[claim.id];
    const error = evidenceErrors[claim.id];

    if (!loading && !data && !error) {
      return (
        <button
          type="button"
          className="btn btn-evidence"
          onClick={() => retrieveEvidence(claim)}
          title="Find supporting evidence for this factual claim"
        >
          <Globe size={16} style={{ marginRight: "0.4rem" }} />
          <span>Find Evidence</span>
        </button>
      );
    }

    if (loading) {
      return (
        <div className="evidence-loading">
          <Loader2 size={18} className="spinner" />
          <span>Retrieving evidence...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="evidence-error">
          <AlertTriangle size={16} style={{ marginRight: "0.4rem", color: "#ef4444" }} />
          <span>Error: {error}</span>
          <button
            type="button"
            className="btn btn-retry"
            onClick={() => retrieveEvidence(claim)}
          >
            Retry
          </button>
        </div>
      );
    }

    if (data && data.evidence && data.evidence.length > 0) {
      return (
        <div className="evidence-results">
          <div className="evidence-header">
            <Shield size={16} style={{ color: "#10b981", marginRight: "0.4rem" }} />
            <strong>Evidence Found ({data.evidence.length})</strong>
            <span className="evidence-status-badge">{data.status}</span>
          </div>
          <div className="evidence-list">
            {data.evidence.map((item, idx) => (
              <div key={item.evidenceId || idx} className="evidence-item">
                <div className="evidence-item-header">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="evidence-title"
                  >
                    {item.title}
                    <ExternalLink size={12} style={{ marginLeft: "0.3rem", verticalAlign: "middle" }} />
                  </a>
                  <span className="evidence-score">Score: {(item.retrievalScore * 100).toFixed(0)}%</span>
                </div>
                <div className="evidence-meta">
                  <span className="evidence-publisher">
                    <Globe size={12} /> {item.publisher || item.sourceType}
                  </span>
                  {item.publishedAt && (
                    <span className="evidence-date">
                      <Clock size={12} /> Published: {formatDate(item.publishedAt)}
                    </span>
                  )}
                  <span className="evidence-retrieved">
                    <Clock size={12} /> Retrieved: {formatDate(item.retrievedAt)}
                  </span>
                  <span className={`evidence-source-type source-${item.sourceType.toLowerCase()}`}>
                    {item.sourceType}
                  </span>
                  {item.extractionStatus !== "SUCCESS" && (
                    <span className="evidence-extraction-status status-partial">
                      {item.extractionStatus}
                    </span>
                  )}
                </div>
                <p className="evidence-snippet">{item.snippet}</p>
                <div className="evidence-query">
                  <small>Query: &ldquo;{item.searchQuery}&rdquo;</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (data && data.status === "SKIPPED_NON_FACTUAL") {
      return (
        <div className="evidence-skipped">
          <Info size={16} style={{ color: "#6b7280", marginRight: "0.4rem" }} />
          <span>Evidence retrieval only available for FACTUAL claims</span>
        </div>
      );
    }

    return (
      <div className="evidence-empty">
        <Globe size={16} style={{ color: "#6b7280", marginRight: "0.4rem" }} />
        <span>No evidence found for this claim</span>
        <button type="button" className="btn btn-retry" onClick={() => retrieveEvidence(claim)}>
          Search again
        </button>
        {data?.queries?.length > 0 && (
          <details className="evidence-queries">
            <summary>Queries attempted ({data.queries.length})</summary>
            <ul>
              {data.queries.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  };

  const renderVerdictSection = (claim) => {
    const loading = verdictLoading[claim.id];
    const data = verdictData[claim.id];
    const error = verdictErrors[claim.id];
    const evidenceResult = evidenceData[claim.id];

    // Show verify button only if evidence exists and no verdict yet
    if (!loading && !data && !error && evidenceResult?.evidence?.length > 0) {
      return (
        <button
          type="button"
          className="btn btn-verify"
          onClick={() => verifyClaim(claim)}
          title="Verify this claim against retrieved evidence using NLI"
        >
          <Brain size={16} style={{ marginRight: "0.4rem" }} />
          <span>Verify Claim</span>
        </button>
      );
    }

    if (loading) {
      return (
        <div className="verdict-loading">
          <Loader2 size={18} className="spinner" />
          <span>Verifying claim against evidence...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="verdict-error">
          <AlertTriangle size={16} style={{ marginRight: "0.4rem", color: "#ef4444" }} />
          <span>Error: {error}</span>
          <button
            type="button"
            className="btn btn-retry"
            onClick={() => verifyClaim(claim)}
          >
            Retry
          </button>
        </div>
      );
    }

    if (data) {
      const verdictColor = getVerdictColor(data.finalVerdict);
      const verdictIcon = getVerdictIcon(data.finalVerdict);
      const verdictLabel = getVerdictLabel(data.finalVerdict);

      return (
        <div className="verdict-results" style={{ borderLeftColor: verdictColor }}>
          <div className="verdict-header" style={{ backgroundColor: `${verdictColor}15`, borderBottomColor: `${verdictColor}33` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              {verdictIcon}
              <strong style={{ color: verdictColor }}>{verdictLabel}</strong>
              <span className="verdict-confidence">Confidence: {(data.aggregateConfidence * 100).toFixed(0)}%</span>
              <span className="verdict-status-badge">{data.status}</span>
            </div>
            <p className="verdict-summary">{data.summary}</p>
            <div className="verdict-evidence-balance">
              <span>Supporting sources: {data.supportingEvidenceCount}</span>
              <span>Contradicting sources: {data.refutingEvidenceCount}</span>
              <span>Inconclusive: {data.neutralEvidenceCount}</span>
            </div>
          </div>

          {data.evidenceAssessments && data.evidenceAssessments.length > 0 && (
            <div className="verdict-assessments">
              <h4 style={{ margin: "0.75rem 0 0.5rem", fontSize: "0.85rem", color: "#94a3b8" }}>
                Evidence Assessments
              </h4>
              <div className="assessment-list">
                {data.evidenceAssessments.map((assessment, idx) => {
                  const assessmentColor = getVerdictColor(assessment.verdict);
                  const assessmentIcon = getVerdictIcon(assessment.verdict);
                  const source = evidenceResult?.evidence?.find((item) => item.evidenceId === assessment.evidenceId);
                  return (
                    <div key={assessment.evidenceId || idx} className="assessment-item" style={{ borderLeftColor: assessmentColor }}>
                      <div className="assessment-header">
                        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: assessmentColor }}>
                          {assessmentIcon}
                          <strong>{getVerdictLabel(assessment.verdict)}</strong>
                          <span className="assessment-confidence">({(assessment.confidence * 100).toFixed(0)}%)</span>
                        </span>
                      </div>
                      <p className="assessment-reasoning">{assessment.reasoning}</p>
                      {assessment.relevantSnippet && (
                        <p className="assessment-snippet">{assessment.relevantSnippet}</p>
                      )}
                      {source && (
                        <a href={source.url} target="_blank" rel="noopener noreferrer" className="assessment-source">
                          Source: {source.title}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data.errors && data.errors.length > 0 && (
            <div className="verdict-errors">
              {data.errors.map((err, idx) => (
                <div key={idx} className="verdict-error-item">
                  <AlertTriangle size={14} style={{ color: "#f59e0b", marginRight: "0.4rem" }} />
                  <span>{err.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // No evidence available for verification
    if (evidenceResult && (!evidenceResult.evidence || evidenceResult.evidence.length === 0)) {
      return (
        <div className="verdict-skipped">
          <Info size={16} style={{ color: "#6b7280", marginRight: "0.4rem" }} />
          <span>No evidence available for verification</span>
        </div>
      );
    }

    return null;
  };

  if (viewMode === "simple") {
    const factualClaims = claims.filter((claim) => claim.type === "FACTUAL");
    const verdicts = factualClaims
      .map((claim) => verdictData[claim.id]?.finalVerdict)
      .filter(Boolean);
    const supportedCount = verdicts.filter((verdict) => verdict === "SUPPORTS").length;
    const refutedCount = verdicts.filter((verdict) => verdict === "REFUTES").length;
    const unresolvedCount = verdicts.filter((verdict) => verdict === "NOT_ENOUGH_INFO").length;
    const checkingCount = factualClaims.filter((claim) =>
      evidenceLoading[claim.id] ||
      verdictLoading[claim.id] ||
      (!evidenceData[claim.id] && !evidenceErrors[claim.id] && !verdictErrors[claim.id])
    ).length;

    let overallTitle = "No checkable claims found";
    let overallDescription = "This video did not contain a claim that could be checked as a factual statement.";
    let overallClass = "inconclusive";

    if (factualClaims.length > 0) {
      if (checkingCount > 0) {
        overallTitle = "Checking the claims";
        overallDescription = "We are looking for sources and comparing them with each checkable statement.";
      } else if (supportedCount > 0 && refutedCount > 0) {
        overallTitle = "Mixed evidence";
        overallDescription = "Some claims have supporting evidence and others have contradicting evidence.";
        overallClass = "mixed";
      } else if (refutedCount > 0) {
        overallTitle = "Evidence contradicts claims";
        overallDescription = "At least one claim is contradicted by the sources we found. Review each claim and its sources below.";
        overallClass = "refuted";
      } else if (supportedCount > 0) {
        overallTitle = unresolvedCount > 0 || verdicts.length < factualClaims.length
          ? "Evidence supports some claims"
          : "Evidence supports claims";
        overallDescription = unresolvedCount > 0 || verdicts.length < factualClaims.length
          ? "Available sources support some claims; others remain unresolved. This is not a guarantee that every statement in the video is true."
          : "The available sources support the claims checked. This is not a guarantee that every statement in the video is true.";
        overallClass = "supported";
      } else {
        overallTitle = "Evidence is inconclusive";
        overallDescription = "The sources we found were not enough to determine whether these claims are accurate.";
      }
    }

    return (
      <section className="card quick-results" aria-live="polite">
        <div className={`quick-overview quick-overview-${overallClass}`}>
          <div className="quick-overview-heading">
            <span className="quick-overview-label">Video claim check</span>
            <h2>{overallTitle}</h2>
          </div>
          <p>{overallDescription}</p>
          <div className="quick-counts" aria-label="Claim check summary">
            <span>{factualClaims.length} checkable {factualClaims.length === 1 ? "claim" : "claims"}</span>
            {supportedCount > 0 && <span>{supportedCount} supported</span>}
            {refutedCount > 0 && <span>{refutedCount} contradicted</span>}
            {unresolvedCount > 0 && <span>{unresolvedCount} inconclusive</span>}
            {checkingCount > 0 && <span>{checkingCount} still checking</span>}
          </div>
        </div>

        {videoUrl && (
          <div className="claim-video-player">
            <video ref={videoRef} src={videoUrl} controls onTimeUpdate={stopAtClaimEnd} />
            {playbackError && <p className="playback-error">{playbackError}</p>}
            <p>Choose “Play clip” on a claim to hear the relevant part of the video.</p>
          </div>
        )}

        {factualClaims.length === 0 ? (
          <p className="quick-empty">There are no factual claims to check in this video.</p>
        ) : (
          <div className="quick-claims-list">
            {factualClaims.map((claim) => {
              const verdict = verdictData[claim.id];
              const evidence = evidenceData[claim.id]?.evidence || [];
              const assessments = verdict?.evidenceAssessments || [];
              const sources = assessments
                .map((assessment) => ({
                  assessment,
                  source: evidence.find((item) => item.evidenceId === assessment.evidenceId),
                }))
                .filter((item) => item.source);
              const error = evidenceErrors[claim.id] || verdictErrors[claim.id];
              const status = verdict
                ? getVerdictLabel(verdict.finalVerdict)
                : evidenceLoading[claim.id]
                  ? "Finding sources"
                  : verdictLoading[claim.id]
                    ? "Comparing sources"
                    : evidenceData[claim.id] && evidence.length === 0
                      ? "No evidence found"
                    : error
                      ? "Could not finish check"
                      : "Waiting for evidence";
              const statusClass = verdict
                ? verdict.finalVerdict === "SUPPORTS"
                  ? "supported"
                  : verdict.finalVerdict === "REFUTES"
                    ? "refuted"
                    : "inconclusive"
                : error || (evidenceData[claim.id] && evidence.length === 0)
                  ? "inconclusive"
                  : "pending";

              return (
                <article key={claim.id} className="quick-claim-card">
                  <div className="quick-claim-meta">
                    <span className="timestamp-badge">
                      {formatTime(claim.startTime)} - {formatTime(claim.endTime)}
                    </span>
                    {videoUrl && (
                      <button
                        type="button"
                        className="btn-play-claim"
                        onClick={() => playClaimSegment(claim)}
                      >
                        <Play size={14} /> Play clip
                      </button>
                    )}
                    <span className={`quick-status quick-status-${statusClass}`}>
                      {status}
                    </span>
                  </div>

                  <h3>{claim.normalizedText || claim.originalText}</h3>
                  {claim.normalizedText && claim.originalText !== claim.normalizedText && (
                    <p className="quick-spoken-text">Spoken: “{claim.originalText}”</p>
                  )}

                  {verdict?.summary && <p className="quick-verdict-summary">{verdict.summary}</p>}
                  {error && !verdict && (
                    <p className="quick-check-error">
                      {evidenceData[claim.id] && evidence.length === 0
                        ? "We could not find a usable source for this claim."
                        : evidenceErrors[claim.id]
                        ? "We could not retrieve sources for this claim."
                        : "We found sources but could not compare them with this claim."}
                    </p>
                  )}

                  {sources.length > 0 ? (
                    <div className="quick-sources">
                      <strong>Evidence</strong>
                      {sources.slice(0, 3).map(({ assessment, source }, index) => (
                        <a
                          key={assessment.evidenceId || index}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className={`quick-source-verdict quick-source-${assessment.verdict.toLowerCase()}`}>
                            {getVerdictLabel(assessment.verdict)}
                          </span>
                          <span>{source.title || source.publisher || "View source"}</span>
                          <ExternalLink size={14} />
                        </a>
                      ))}
                    </div>
                  ) : evidence.length > 0 ? (
                    <div className="quick-sources">
                      <strong>Sources found</strong>
                      {evidence.slice(0, 3).map((source, index) => (
                        <a key={source.evidenceId || index} href={source.url} target="_blank" rel="noopener noreferrer">
                          <span>{source.title || source.publisher || "View source"}</span>
                          <ExternalLink size={14} />
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {claim.reason && (
                    <details className="quick-details">
                      <summary>About this claim</summary>
                      <p>{claim.reason}</p>
                    </details>
                  )}
                  {error && (
                    <button
                      type="button"
                      className="btn btn-retry"
                      onClick={() => evidenceErrors[claim.id] ? retrieveEvidence(claim) : verifyClaim(claim)}
                    >
                      Try again
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <p className="quick-disclaimer">
          Automated results are based on the sources found. Check the linked sources, especially for current or disputed topics.
        </p>
      </section>
    );
  }

  return (
    <div className="card claims-container">
      {/* Header */}
      <div className="results-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Sparkles color="#3b82f6" size={24} />
          <h2>Detected Claims & Classification</h2>
        </div>
        <span className="phase-indicator">Phase 2 Output</span>
      </div>

      {videoUrl && (
        <div className="claim-video-player">
          <video ref={videoRef} src={videoUrl} controls onTimeUpdate={stopAtClaimEnd} />
          {playbackError && <p className="playback-error">{playbackError}</p>}
          <p>Select “Play excerpt” on a claim to jump to the spoken portion.</p>
        </div>
      )}

      {/* Summary Statistics Cards */}
      <div className="summary-grid">
        <div className="summary-card stat-total">
          <div className="summary-icon">
            <Layers size={18} />
          </div>
          <div className="summary-content">
            <span className="summary-val">{summary.total || claims.length}</span>
            <span className="summary-lbl">Total Claims</span>
          </div>
        </div>

        <div className="summary-card stat-factual">
          <div className="summary-icon">
            <CheckCircle2 size={18} />
          </div>
          <div className="summary-content">
            <span className="summary-val">{summary.factual || 0}</span>
            <span className="summary-lbl">Factual</span>
          </div>
        </div>

        <div className="summary-card stat-opinion">
          <div className="summary-icon">
            <HelpCircle size={18} />
          </div>
          <div className="summary-content">
            <span className="summary-val">{summary.opinion || 0}</span>
            <span className="summary-lbl">Opinions</span>
          </div>
        </div>

        <div className="summary-card stat-prediction">
          <div className="summary-icon">
            <TrendingUp size={18} />
          </div>
          <div className="summary-content">
            <span className="summary-val">{summary.prediction || 0}</span>
            <span className="summary-lbl">Predictions</span>
          </div>
        </div>

        <div className="summary-card stat-nonclaim">
          <div className="summary-icon">
            <MinusCircle size={18} />
          </div>
          <div className="summary-content">
            <span className="summary-val">{summary.nonClaim || 0}</span>
            <span className="summary-lbl">Non-Claims</span>
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="toolbar">
        <div className="filter-tabs">
          <button
            type="button"
            className={`tab-btn ${selectedCategory === "ALL" ? "active" : ""}`}
            onClick={() => setSelectedCategory("ALL")}
          >
            All ({claims.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${selectedCategory === "FACTUAL" ? "active" : ""}`}
            onClick={() => setSelectedCategory("FACTUAL")}
          >
            Factual ({summary.factual || 0})
          </button>
          <button
            type="button"
            className={`tab-btn ${selectedCategory === "OPINION" ? "active" : ""}`}
            onClick={() => setSelectedCategory("OPINION")}
          >
            Opinion ({summary.opinion || 0})
          </button>
          <button
            type="button"
            className={`tab-btn ${selectedCategory === "PREDICTION" ? "active" : ""}`}
            onClick={() => setSelectedCategory("PREDICTION")}
          >
            Prediction ({summary.prediction || 0})
          </button>
          <button
            type="button"
            className={`tab-btn ${selectedCategory === "NON_CLAIM" ? "active" : ""}`}
            onClick={() => setSelectedCategory("NON_CLAIM")}
          >
            Non-Claim ({summary.nonClaim || 0})
          </button>
        </div>

        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search claims by keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Claims List */}
      {filteredClaims.length === 0 ? (
        <div className="empty-segments">
          No claims match the selected filter criteria.
        </div>
      ) : (
        <div className="claims-list">
          {filteredClaims.map((claim) => (
            <div key={claim.id} className={`claim-card card-border-${claim.type.toLowerCase()}`}>
              {/* Claim Card Header */}
              <div className="claim-card-header">
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <div className="timestamp-badge">
                    {formatTime(claim.startTime)} - {formatTime(claim.endTime)}
                  </div>
                  {videoUrl && (
                    <button
                      type="button"
                      className="btn-play-claim"
                      onClick={() => playClaimSegment(claim)}
                      title="Play the video excerpt where this claim was spoken"
                    >
                      <Play size={14} /> Play excerpt
                    </button>
                  )}
                  <ClaimBadge type={claim.type} />
                </div>
                <span className="claim-id-badge">{claim.id}</span>
              </div>

              {/* Spoken Verbatim Transcript */}
              <div className="claim-body-row">
                <span className="claim-label">Spoken (Original):</span>
                <p className="claim-original-text">"{claim.originalText}"</p>
              </div>

              {/* Normalized Statement */}
              <div className="claim-body-row">
                <span className="claim-label">Normalized Proposition:</span>
                <p className="claim-normalized-text">{claim.normalizedText}</p>
              </div>

              {/* Classification Reason */}
              {claim.reason && (
                <div className="claim-reason-box">
                  <Info size={15} style={{ flexShrink: 0, marginTop: "2px" }} />
                  <span>
                    <strong>Reasoning:</strong> {claim.reason}
                  </span>
                </div>
              )}

              {/* Phase 3: Evidence Retrieval */}
              {claim.type === "FACTUAL" && (
                <div className="evidence-section">
                  <div className="evidence-trigger">
                    {renderEvidenceSection(claim)}
                  </div>
                </div>
              )}

              {/* Phase 4: NLI Verification */}
              {claim.type === "FACTUAL" && evidenceData[claim.id]?.evidence?.length > 0 && (
                <div className="verdict-section">
                  <div className="verdict-trigger">
                    {renderVerdictSection(claim)}
                  </div>
                </div>
              )}

              {/* Segments Mapping Footer */}
              {claim.sourceSegmentIds?.length > 0 && (
                <div className="claim-footer">
                  <span>Source Segments:</span>
                  <div className="seg-pills">
                    {claim.sourceSegmentIds.map((id) => (
                      <span key={id} className="seg-pill">
                        Seg #{id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}