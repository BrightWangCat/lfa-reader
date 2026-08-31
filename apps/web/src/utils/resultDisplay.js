// Plain-language result copy for the owner shell. Clinical category values
// stay the single source of truth; this module only translates them for pet
// owners and never invents a clinical claim: L and I are described as line
// positions, not as a specific virus, so interpretation stays with the vet.

const TICK_BORNE_PREFIX = "Positive:";

// Analyte labels come from the backend Tick Borne panel; keys must match
// TICK_BORNE_ANALYTE_LABELS in apps/backend/app/services/result_categories.py.
const TICK_BORNE_PLAIN_NAMES = {
  "E. canis/E. ewingii Ab": "Ehrlichia, a tick-borne bacterium",
  "Lyme disease Ab (B. burgdorferi)": "Lyme disease",
  "A. phagocytophilum/A. platys Ab": "Anaplasma, a tick-borne bacterium",
  "Heartworm Ag": "Heartworm",
};

const VET_ADVICE =
  "Please share this result with your veterinarian to confirm what it means for your pet.";

export function isPositiveFinal(result) {
  return typeof result === "string" && result.startsWith("Positive");
}

export function getPlainResult(diseaseCategory, result) {
  if (!result) {
    return {
      tone: "pending",
      title: "Waiting for a reading",
      summary:
        "This photo has not been analyzed yet. Run the analysis to get a result.",
    };
  }

  if (result === "Invalid") {
    return {
      tone: "invalid",
      title: "The test could not be read",
      summary:
        "The photo or the test itself could not be read. Try retaking the photo in good light, or repeat the test with a new cassette.",
    };
  }

  if (result === "Negative") {
    return {
      tone: "good",
      title: "No signs detected",
      summary:
        diseaseCategory === "Tick Borne"
          ? "This test did not detect signs of the tick-borne diseases or heartworm it screens for."
          : "This test did not detect what it screens for. Follow any advisory shown above.",
    };
  }

  if (result.startsWith(TICK_BORNE_PREFIX)) {
    const labels = result
      .slice(TICK_BORNE_PREFIX.length)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const plainNames = labels.map(
      (label) => TICK_BORNE_PLAIN_NAMES[label] || label
    );
    return {
      tone: "attention",
      title: "The test shows a positive signal",
      summary: `This test detected a signal for: ${plainNames.join("; ")}. ${VET_ADVICE}`,
    };
  }

  if (isPositiveFinal(result)) {
    // FIV/FeLV style categories such as "Positive L" or "Positive L+I".
    const lines = result.replace("Positive", "").trim();
    return {
      tone: "attention",
      title: "The test shows a positive signal",
      summary: `The test shows a positive line${lines.includes("+") ? "s" : ""} at position ${lines}. ${VET_ADVICE}`,
    };
  }

  // Unknown category: show it untranslated rather than guessing.
  return {
    tone: "neutral",
    title: result,
    summary: VET_ADVICE,
  };
}
