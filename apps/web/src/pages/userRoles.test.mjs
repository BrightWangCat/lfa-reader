import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_ROLE,
  DOCTOR_ROLE,
  ROLE_OPTIONS,
  USER_ROLE,
  getRoleDisplay,
  isClinicalRole,
  normalizeRole,
} from "./userRoles.js";

test("normalizes legacy single role to user", () => {
  assert.equal(normalizeRole("single"), USER_ROLE);
  assert.equal(getRoleDisplay("single").label, "User");
});

test("keeps admin role unchanged", () => {
  assert.equal(normalizeRole("admin"), ADMIN_ROLE);
  assert.deepEqual(getRoleDisplay("admin"), {
    role: ADMIN_ROLE,
    label: "Admin",
  });
});

test("displays the doctor role", () => {
  assert.deepEqual(getRoleDisplay("doctor"), {
    role: DOCTOR_ROLE,
    label: "Doctor",
  });
});

test("role options submit user, doctor and admin values", () => {
  assert.deepEqual(ROLE_OPTIONS, [
    { value: USER_ROLE, label: "User" },
    { value: DOCTOR_ROLE, label: "Doctor" },
    { value: ADMIN_ROLE, label: "Admin" },
  ]);
});

test("doctor and admin are clinical, user and legacy single are not", () => {
  assert.equal(isClinicalRole(DOCTOR_ROLE), true);
  assert.equal(isClinicalRole(ADMIN_ROLE), true);
  assert.equal(isClinicalRole(USER_ROLE), false);
  assert.equal(isClinicalRole("single"), false);
  assert.equal(isClinicalRole(undefined), false);
});
