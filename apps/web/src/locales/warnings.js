// Maps backend-generated warning keys to the copy shown on the Results page.
// Keys are owned by the backend (see apps/backend/app/services/warnings.py)
// so frontends stay replaceable without server changes.
export const WARNING_MESSAGES = {
  young_cat_false_negative:
    "Younger cats may have false negative results, it is recommended to repeat the test in 6 months.",
};

export function resolveWarning(key) {
  return WARNING_MESSAGES[key] || key;
}
