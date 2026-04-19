import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, App as AntApp } from "antd";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import UploadPage from "./pages/Upload";
import Results from "./pages/Results";
import History from "./pages/History";
import UserManagement from "./pages/UserManagement";
import Statistics from "./pages/Statistics";
import CameraCapture from "./components/CameraCapture";

// Theme tokens matching the existing color palette
const themeConfig = {
  token: {
    colorPrimary: "#2b6cb0",
    colorSuccess: "#276749",
    colorError: "#c53030",
    colorWarning: "#d69e2e",
    colorBgLayout: "#f0f4f8",
    colorTextBase: "#2d3748",
    borderRadius: 6,
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
};

function App() {
  return (
    <ConfigProvider theme={themeConfig}>
      <AntApp>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout><Home /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/upload"
                element={
                  <ProtectedRoute>
                    <Layout><UploadPage /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/results"
                element={
                  <ProtectedRoute>
                    <Layout><Results /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/history"
                element={
                  <ProtectedRoute>
                    <Layout><History /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/analytics"
                element={
                  <ProtectedRoute>
                    <Layout><Statistics /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute>
                    <Layout><UserManagement /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/camera"
                element={
                  <ProtectedRoute>
                    <CameraCapture />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
