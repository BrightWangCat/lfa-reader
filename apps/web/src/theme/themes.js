// Ant Design theme tokens for the two experience shells. The owner shell uses
// the warm palette, the clinic shell the cool one; result-status semantics
// (negative green, positive red, pending amber) are shared across both.
// Matching CSS variables for custom markup live in index.css under
// .owner-shell / .clinic-shell.

const SHARED_TOKENS = {
  colorWarning: "#9A6B1F",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
};

export const ownerTheme = {
  token: {
    ...SHARED_TOKENS,
    colorPrimary: "#C0532B",
    colorInfo: "#00897B",
    colorSuccess: "#2F7D53",
    colorError: "#B23B25",
    colorBgLayout: "#FAF6F0",
    colorTextBase: "#2E2620",
    colorBorder: "#EADFD2",
    colorBorderSecondary: "#F3EADD",
    borderRadius: 12,
  },
};

export const clinicTheme = {
  token: {
    ...SHARED_TOKENS,
    colorPrimary: "#1D5FBF",
    colorInfo: "#1D5FBF",
    colorSuccess: "#1E7A50",
    colorError: "#BF3E2B",
    colorBgLayout: "#F4F7FA",
    colorTextBase: "#14202B",
    colorBorder: "#DBE4EC",
    colorBorderSecondary: "#E9EFF5",
    borderRadius: 8,
  },
};
