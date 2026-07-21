export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--accent)",
    colorBackground: "var(--bg-elevated)",
    colorInputBackground: "var(--bg)",
    colorInputText: "var(--text)",
    colorText: "var(--text)",
    colorTextSecondary: "var(--text-muted)",
    borderRadius: "var(--radius)",
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
  },
  elements: {
    card: {
      backgroundColor: "var(--bg-elevated)",
      border: "1px solid var(--border)",
      boxShadow: "var(--shadow)",
    },
    formButtonPrimary: {
      backgroundColor: "var(--accent)",
      color: "var(--on-accent)",
    },
    footerActionLink: {
      color: "var(--accent)",
    },
  },
};
