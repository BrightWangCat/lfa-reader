import axios from "axios";

// Production: empty string (same-origin via Nginx reverse proxy)
// Development: set VITE_API_BASE_URL=http://localhost:8000 in .env.local
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

const api = axios.create({
  baseURL: API_BASE_URL,
});

export { API_BASE_URL };

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function uploadSingle(formData, onUploadProgress) {
  return api.post("/api/upload/single", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });
}

export const listImages = () => api.get("/api/upload/images");
export const getImage = (imageId) => api.get(`/api/upload/image/${imageId}`);
export const deleteImage = (imageId) => api.delete(`/api/upload/image/${imageId}`);
export const classifyImage = (imageId) =>
  api.post(`/api/readings/image/${imageId}/classify`);
export const getClassifyStatus = (imageId) =>
  api.get(`/api/readings/image/${imageId}/status`);
export const cancelClassify = (imageId) =>
  api.post(`/api/readings/image/${imageId}/cancel`);
export const correctReading = (imageId, manualCorrection) =>
  api.put(`/api/readings/image/${imageId}/correct`, {
    manual_correction: manualCorrection,
  });
// Map-only aggregate open to every signed-in role; the full /stats/global
// stays clinical-only.
export const getMapStats = (diseaseCategory) =>
  api.get("/api/stats/map", {
    params: diseaseCategory ? { disease_category: diseaseCategory } : {},
  });
export const decideDoctorApplication = (userId, decision) =>
  api.put(`/api/users/${userId}/doctor-application`, { decision });

// Build a token-bearing URL for use in <img src> / download links.
export const buildImageFileUrl = (imageId, original = false) => {
  const token = localStorage.getItem("token");
  const base = `${API_BASE_URL}/api/upload/image/${imageId}/file?token=${token}`;
  return original ? `${base}&original=true` : base;
};

export default api;
