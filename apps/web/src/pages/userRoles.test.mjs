import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_ROLE,
  ROLE_OPTIONS,
  USER_ROLE,
  getRoleDisplay,
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

test("role options submit user role value", () => {
  assert.deepEqual(ROLE_OPTIONS, [
    { value: USER_ROLE, label: "User" },
    { value: ADMIN_ROLE, label: "Admin" },
  ]);
});
