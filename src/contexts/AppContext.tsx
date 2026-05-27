import React, { createContext } from "react";
import { User } from "../types";

// Lightweight app-wide context exposing the signed-in user, so cross-cutting hooks (e.g. useIsAdmin)
// can read role without prop-drilling. The single source of truth for currentUser remains app/index;
// this provider just mirrors it down the tree.
export interface AppContextValue {
  currentUser?: User | null;
}

export const AppContext = createContext<AppContextValue>({ currentUser: null });

export function AppProvider({ currentUser, children }: { currentUser?: User | null; children: React.ReactNode }) {
  return <AppContext.Provider value={{ currentUser }}>{children}</AppContext.Provider>;
}
