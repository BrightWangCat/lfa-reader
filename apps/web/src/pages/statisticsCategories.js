// Result-status palette: negative stays calm green, positive families use a
// warm ramp from light to severe so subtype severity reads at a glance. Every
// use pairs the color with a text label; color never carries identity alone.
export const CATEGORY_COLORS = {
  "Negative": "#1E7A50",
  "Positive": "#BF3E2B",
  "Positive L": "#C9703F",
  "Positive I": "#A64526",
  "Positive L+I": "#7C2D12",
};

const EMPTY_CONFIG = {
  resultCategories: [],
  positiveCategories: [],
};

const CATEGORY_CONFIGS = {
  fiv_felv: {
    resultCategories: [
      "Negative",
      "Positive L",
      "Positive I",
      "Positive L+I",
    ],
    positiveCategories: ["Positive L", "Positive I", "Positive L+I"],
  },
  tick_borne: {
    resultCategories: ["Negative", "Positive"],
    positiveCategories: ["Positive"],
  },
};

export function getStatisticsCategoryConfig(diseaseId) {
  return CATEGORY_CONFIGS[diseaseId] || EMPTY_CONFIG;
}
