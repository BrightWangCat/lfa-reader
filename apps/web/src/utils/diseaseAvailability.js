export const CANINE_UROTHELIAL_CARCINOMA_ID =
  "canine_urothelial_carcinoma";

export const UNDER_DEVELOPMENT_NOTICE = {
  title: "Under Development",
  content:
    "The Canine Urothelial Carcinoma workflow is currently under development.",
};

export function isDiseaseUnderDevelopment(diseaseId) {
  return diseaseId === CANINE_UROTHELIAL_CARCINOMA_ID;
}
