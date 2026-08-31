export const USER_ROLE = "user";
export const DOCTOR_ROLE = "doctor";
export const ADMIN_ROLE = "admin";
const LEGACY_SINGLE_ROLE = "single";

// Display names match the account types offered at registration: the user
// role reads as Pet Owner and the doctor role as Veterinarian everywhere.
export const ROLE_OPTIONS = [
  { value: USER_ROLE, label: "Pet Owner" },
  { value: DOCTOR_ROLE, label: "Veterinarian" },
  { value: ADMIN_ROLE, label: "Admin" },
];

export function normalizeRole(role) {
  return role === LEGACY_SINGLE_ROLE ? USER_ROLE : role;
}

// Clinical means doctor or admin: the roles that enter the clinic shell and
// see every reading. Mirrors CLINICAL_ROLES in the backend role_utils.
export function isClinicalRole(role) {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === DOCTOR_ROLE || normalizedRole === ADMIN_ROLE;
}

export function getRoleDisplay(role) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === ADMIN_ROLE) {
    return { role: ADMIN_ROLE, label: "Admin" };
  }
  if (normalizedRole === DOCTOR_ROLE) {
    return { role: DOCTOR_ROLE, label: "Veterinarian" };
  }
  return { role: USER_ROLE, label: "Pet Owner" };
}
