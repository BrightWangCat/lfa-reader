export const CATEGORY_COLORS = {
  "Negative": "#38a169",
  "Positive": "#c53030",
  "Positive L": "#e53e3e",
  "Positive I": "#dd6b20",
  "Positive L+I": "#805ad5",
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
