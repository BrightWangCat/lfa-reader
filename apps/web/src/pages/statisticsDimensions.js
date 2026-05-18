export function getVisibleDimensionEntries(dimensionLabels, selectedDisease) {
  return Object.entries(dimensionLabels).filter(([dimKey]) => {
    if (dimKey === "disease_category") {
      return false;
    }
    if (dimKey === "preventive_treatment") {
      return Boolean(selectedDisease?.needs_preventive_treatment);
    }
    return true;
  });
}
