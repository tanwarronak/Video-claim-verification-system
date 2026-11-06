import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateClaimSourceGrounding } from "../src/validators/claim-grounding.js";

describe("Claim source grounding", () => {
  const segments = [
    { id: 8, text: "The Earth revolves around the Sun." },
    { id: 9, text: "One revolution takes approximately 365 days." },
  ];

  it("accepts verbatim claims across punctuation and adjacent segments", () => {
    const claims = [
      {
        originalText: "Earth revolves around the Sun",
        sourceSegmentIds: [8],
      },
      {
        originalText: "revolution takes approximately 365 days",
        sourceSegmentIds: [9],
      },
    ];

    assert.deepEqual(validateClaimSourceGrounding(claims, segments), claims);
  });

  it("rejects unknown segment IDs", () => {
    assert.throws(
      () => validateClaimSourceGrounding([{ originalText: "Earth", sourceSegmentIds: [99] }], segments),
      { code: "CLAIM_SOURCE_REFERENCE_INVALID", statusCode: 502 }
    );
  });

  it("rejects text that is not spoken in the referenced segment", () => {
    assert.throws(
      () =>
        validateClaimSourceGrounding(
          [{ originalText: "Earth is flat", sourceSegmentIds: [8] }],
          segments
        ),
      { code: "CLAIM_SOURCE_TEXT_MISMATCH", statusCode: 502 }
    );
  });
});
