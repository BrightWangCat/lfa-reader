import { isClinicalRole } from "../pages/userRoles";

// Shell-aware navigation targets. Pet owners and clinical roles live in two
// separate route trees; shared pages use these helpers instead of hardcoded
// paths so links land inside the caller's own shell.

export const homePathFor = (user) =>
  isClinicalRole(user?.role) ? "/clinic" : "/home";

export const startTestPathFor = (user) =>
  isClinicalRole(user?.role) ? "/clinic/new" : "/start";

export const historyPathFor = (user) =>
  isClinicalRole(user?.role) ? "/clinic/submissions" : "/history";
