// The options shown in the dashboard "Configure Quote Tool" bottom sheet. Pure so the
// admin-gating logic is testable without rendering (the sheet itself is a Modal, never Alert.alert,
// so it works on web). "Edit manually" is admin-only.
export interface ConfigureOption { key: "kit" | "edit" | "import"; icon: string; label: string; adminOnly?: boolean }

export function configureOptions(isAdmin: boolean): ConfigureOption[] {
  const all: ConfigureOption[] = [
    { key: "kit", icon: "message-circle", label: "Chat with Kit" },
    { key: "edit", icon: "edit-2", label: "Edit manually", adminOnly: true },
    { key: "import", icon: "upload", label: "Import price sheet" },
  ];
  return all.filter(o => !o.adminOnly || isAdmin);
}

// Owner-notification gate: send exactly once per business, tied to the welcome email having not yet
// been sent (mirrors the proxy's onboarding gate). Pure + testable.
export function shouldNotifyOwner(onboarding?: { welcome?: number | null } | null): boolean {
  return !(onboarding && onboarding.welcome);
}
