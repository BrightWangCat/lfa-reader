const normalizeSearch = (search) => {
  if (!search) return "";
  return search.startsWith("?") ? search : `?${search}`;
};

export const buildCameraPath = (search) => `/camera${normalizeSearch(search)}`;

export const buildUploadPath = (search) => `/upload${normalizeSearch(search)}`;
