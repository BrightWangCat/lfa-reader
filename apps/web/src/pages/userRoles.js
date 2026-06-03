export const USER_ROLE = "user";
export const ADMIN_ROLE = "admin";
const LEGACY_SINGLE_ROLE = "single";

export const ROLE_OPTIONS = [
  { value: USER_ROLE, label: "User" },
  { value: ADMIN_ROLE, label: "Admin" },
];

export function normalizeRole(role) {
  return role === LEGACY_SINGLE_ROLE ? USER_ROLE : role;
}

export function getRoleDisplay(role) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === ADMIN_ROLE) {
    return { role: ADMIN_ROLE, label: "Admin" };
  }
  return { role: USER_ROLE, label: "User" };
}
