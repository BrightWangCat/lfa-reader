import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import {
  ThemedRoot,
  RoleHome,
  OwnerShellRoute,
  ClinicShellRoute,
  AdminRoute,
  ShellLayout,
} from "./components/RoleRoutes";
import OwnerLayout from "./components/OwnerLayout";
import ClinicLayout from "./components/ClinicLayout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import OwnerHome from "./pages/OwnerHome";
import ClinicDashboard from "./pages/ClinicDashboard";
import CommunityMap from "./pages/CommunityMap";
import UploadPage from "./pages/Upload";
import Results from "./pages/Results";
import History from "./pages/History";
import UserManagement from "./pages/UserManagement";
import Statistics from "./pages/Statistics";
import CameraCapture from "./components/CameraCapture";

// Route map. The owner shell (pet owners) and the clinic shell (doctors and
// admins) are two separate route trees behind one login; record-level pages
// (/upload, /camera, /results) are shared and rendered in the caller's own
// shell layout. Authorization is enforced by the backend; routing only shapes
// the experience.

const ownerPage = (page) => (
  <ProtectedRoute>
    <OwnerShellRoute>
      <OwnerLayout>{page}</OwnerLayout>
    </OwnerShellRoute>
  </ProtectedRoute>
);

const clinicPage = (page) => (
  <ProtectedRoute>
    <ClinicShellRoute>
      <ClinicLayout>{page}</ClinicLayout>
    </ClinicShellRoute>
  </ProtectedRoute>
);

const sharedPage = (page) => (
  <ProtectedRoute>
    <ShellLayout>{page}</ShellLayout>
  </ProtectedRoute>
);

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemedRoot>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <RoleHome />
                </ProtectedRoute>
              }
            />

            {/* Shared record-level pages */}
            <Route path="/upload" element={sharedPage(<UploadPage />)} />
            <Route path="/results" element={sharedPage(<Results />)} />
            <Route
              path="/camera"
              element={
                <ProtectedRoute>
                  <CameraCapture />
                </ProtectedRoute>
              }
            />

            {/* Owner shell */}
            <Route path="/home" element={ownerPage(<OwnerHome />)} />
            <Route path="/start" element={ownerPage(<Home />)} />
            <Route path="/history" element={ownerPage(<History />)} />
            <Route path="/map" element={ownerPage(<CommunityMap />)} />

            {/* Clinic shell */}
            <Route path="/clinic" element={clinicPage(<ClinicDashboard />)} />
            <Route path="/clinic/new" element={clinicPage(<Home />)} />
            <Route
              path="/clinic/submissions"
              element={clinicPage(<History />)}
            />
            <Route
              path="/clinic/statistics"
              element={clinicPage(<Statistics />)}
            />
            <Route path="/clinic/map" element={clinicPage(<CommunityMap />)} />
            <Route
              path="/clinic/users"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <ClinicLayout>
                      <UserManagement />
                    </ClinicLayout>
                  </AdminRoute>
                </ProtectedRoute>
              }
            />

            {/* Legacy paths from the single-experience app */}
            <Route
              path="/analytics"
              element={<Navigate to="/clinic/statistics" replace />}
            />
            <Route
              path="/users"
              element={<Navigate to="/clinic/users" replace />}
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ThemedRoot>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
