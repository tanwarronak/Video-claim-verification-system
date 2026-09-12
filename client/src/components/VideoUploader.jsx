import React, { useRef } from "react";
import { UploadCloud, FileVideo, X, AlertCircle } from "lucide-react";

export function VideoUploader({
  selectedFile,
  onFileSelect,
  onClearFile,
  onSubmit,
  loading,
  error,
}) {
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      onFileSelect(file);
    }
  };

  const handleInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="card">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleInputChange}
        accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/avi"
        style={{ display: "none" }}
      />

      {!selectedFile ? (
        <div
          className="dropzone"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud className="dropzone-icon" />
          <h3>Select a video or drag & drop here</h3>
          <p>Supports MP4, MOV, WebM, MKV, AVI (Max 100 MB)</p>
        </div>
      ) : (
        <div>
          <div className="file-preview">
            <div className="file-info">
              <FileVideo size={28} color="#3b82f6" />
              <div>
                <div className="file-name">{selectedFile.name}</div>
                <div className="file-size">{formatFileSize(selectedFile.size)}</div>
              </div>
            </div>
            {!loading && (
              <button
                type="button"
                className="btn-icon-only"
                onClick={onClearFile}
                title="Remove video"
              >
                <X size={20} />
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onSubmit}
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="spinner" />
                <span>Processing Video & Transcribing...</span>
              </>
            ) : (
              <span>Upload & Transcribe</span>
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <AlertCircle size={20} />
          <div>{error}</div>
        </div>
      )}
    </div>
  );
}
