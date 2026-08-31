import { Navigate } from "react-router-dom";
import { ConfigProvider, App as AntApp } from "antd";
import { useAuth } from "../context/authStore";
import { isClinicalRole, ADMIN_ROLE, normalizeRole } from "../pages/userRoles";
import { homePathFor } from "../utils/shellPaths";
import { ownerTheme, clinicTheme } from "../theme/themes";
import OwnerLayout from "./OwnerLayout";
import ClinicLayout from "./ClinicLayout";

// Every signed-in user has exactly one shell: pet owners get the owner
// experience, doctors and admins share the clinic experience. Path helpers
// live in utils/shellPaths.js; this file holds the route guard components.

export function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={homePathFor(user)} replace />;
}

export function OwnerShellRoute({ children }) {
  const { user } = useAuth();
  if (isClinicalRole(user?.role)) {
    return <Navigate to="/clinic" replace />;
  }
  return children;
}

export function ClinicShellRoute({ children }) {
  const { user } = useAuth();
  if (!isClinicalRole(user?.role)) {
    return <Navigate to="/home" replace />;
  }
  return children;
}

export function AdminRoute({ children }) {
  const { user } = useAuth();
  if (normalizeRole(user?.role) !== ADMIN_ROLE) {
    return <Navigate to={homePathFor(user)} replace />;
  }
  return children;
}

// Record-level pages (upload, camera, results) are shared by both shells;
// this wrapper renders them inside whichever layout matches the signed-in
// role so navigation and theme stay consistent.
export function ShellLayout({ children }) {
  const { user } = useAuth();
  if (isClinicalRole(user?.role)) {
    return <ClinicLayout>{children}</ClinicLayout>;
  }
  return <OwnerLayout>{children}</OwnerLayout>;
}

// Applies the role-matched Ant Design theme plus the CSS-variable shell class.
// Signed-out pages (login, register) share the warm owner look.
export function ThemedRoot({ children }) {
  const { user } = useAuth();
  const ownerExperience = !user || !isClinicalRole(user.role);
  return (
    <ConfigProvider theme={ownerExperience ? ownerTheme : clinicTheme}>
      <AntApp>
        <div className={ownerExperience ? "owner-shell" : "clinic-shell"}>
          {children}
        </div>
      </AntApp>
    </ConfigProvider>
  );
}
