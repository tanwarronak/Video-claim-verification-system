function tokenize(text) {
  return (text.toLowerCase().replace(/[’‘]/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) || []);
}

function containsGroundedQuote(segments, phrase, sourceIds) {
  if (phrase.length === 0) return false;
  const sourceTokens = segments.flatMap((segment) =>
    tokenize(segment.text).map((token) => ({ token, segmentId: segment.id }))
  );
  if (phrase.length > sourceTokens.length) return false;

  const expectedIds = new Set(sourceIds);
  for (let start = 0; start <= sourceTokens.length - phrase.length; start++) {
    if (phrase.every((token, index) => sourceTokens[start + index].token === token)) {
      const matchedIds = new Set(
        sourceTokens.slice(start, start + phrase.length).map((token) => token.segmentId)
      );
      if (
        matchedIds.size === expectedIds.size &&
        [...matchedIds].every((id) => expectedIds.has(id))
      ) {
        return true;
      }
    }
  }
  return false;
}

export function validateClaimSourceGrounding(claims, segments) {
  const segmentById = new Map();
  segments.forEach((segment, index) => {
    const id = Number(segment.id ?? index);
    if (!Number.isInteger(id) || id < 0 || segmentById.has(id)) {
      const err = new Error("Transcript contains missing or duplicate segment IDs.");
      err.code = "INVALID_TRANSCRIPT_SEGMENTS";
      err.statusCode = 400;
      throw err;
    }
    segmentById.set(id, { text: segment.text || "", order: index });
  });

  for (const [index, claim] of claims.entries()) {
    const sourceIds = claim.sourceSegmentIds;
    if (
      sourceIds.length === 0 ||
      new Set(sourceIds).size !== sourceIds.length ||
      sourceIds.some((id) => !segmentById.has(id))
    ) {
      const err = new Error(`Claim ${index + 1} has missing, duplicate, or unknown source segment IDs.`);
      err.code = "CLAIM_SOURCE_REFERENCE_INVALID";
      err.statusCode = 502;
      throw err;
    }

    const claimTokens = tokenize(claim.originalText);

    const orderedSegments = [...segmentById.entries()]
      .map(([id, segment]) => ({ id, ...segment }))
      .sort((left, right) => left.order - right.order);
    if (!containsGroundedQuote(orderedSegments, claimTokens, sourceIds)) {
      const err = new Error(
        `Claim ${index + 1} originalText is not present in its referenced transcript segments.`
      );
      err.code = "CLAIM_SOURCE_TEXT_MISMATCH";
      err.statusCode = 502;
      throw err;
    }
  }

  return claims;
}
