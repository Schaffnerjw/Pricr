import { useContext } from "react";
import { AppContext } from "../contexts/AppContext";
import { User } from "../types";

// Pure predicate (unit-testable without a renderer): admins + superadmins may edit the quote tool;
// reps may not. Kept separate from the hook so logic can be tested and reused outside React.
export function isAdminRole(user?: Pick<User, "role"> | null): boolean {
  return user?.role === "admin" || user?.role === "superadmin";
}

// True when the signed-in user can edit the quote-tool setup. Reps get false.
export function useIsAdmin(): boolean {
  const { currentUser } = useContext(AppContext);
  return isAdminRole(currentUser);
}
