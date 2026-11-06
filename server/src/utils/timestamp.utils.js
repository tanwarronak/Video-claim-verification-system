/**
 * Timestamp Calculation and Formatting Utilities for Claim Verification.
 */

/**
 * Calculates start and end timestamps for a claim based on its source segment IDs.
 *
 * @param {Array<number>} sourceSegmentIds - Array of segment IDs associated with the claim
 * @param {Map<number, { id: number, start: number, end: number, text: string }>} segmentsMap - Map of all transcript segments
 * @param {number} [fallbackDuration=0] - Fallback total duration if no segments match
 * @returns {{ startTime: number, endTime: number }}
 */
export function calculateClaimTimestamps(sourceSegmentIds, segmentsMap, fallbackDuration = 0) {
  if (!sourceSegmentIds || sourceSegmentIds.length === 0) {
    return { startTime: 0, endTime: Number(fallbackDuration.toFixed(2)) };
  }

  const matchingSegments = sourceSegmentIds
    .map((id) => segmentsMap.get(id))
    .filter(Boolean);

  if (matchingSegments.length === 0) {
    // If specific IDs weren't found, try numeric index lookup fallback
    const allSegments = Array.from(segmentsMap.values());
    if (allSegments.length > 0) {
      return {
        startTime: Number(allSegments[0].start.toFixed(2)),
        endTime: Number(allSegments[allSegments.length - 1].end.toFixed(2)),
      };
    }
    return { startTime: 0, endTime: Number(fallbackDuration.toFixed(2)) };
  }

  const minStart = Math.min(...matchingSegments.map((s) => s.start));
  const maxEnd = Math.max(...matchingSegments.map((s) => s.end));

  return {
    startTime: Number(minStart.toFixed(2)),
    endTime: Number(Math.max(minStart, maxEnd).toFixed(2)),
  };
}

/**
 * Formats a duration in seconds into MM:SS format.
 * @param {number} seconds
 * @returns {string} e.g. "01:23"
 */
export function formatTimestamp(seconds) {
  if (seconds == null || isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
