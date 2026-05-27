import { isAdminRole } from "../../hooks/useIsAdmin";
import { canEditSchema } from "../schemaEditorOps";

describe("admin gating", () => {
  test("useIsAdmin returns true for admin role", () => {
    expect(isAdminRole({ role: "admin" })).toBe(true);
    expect(isAdminRole({ role: "superadmin" })).toBe(true);
  });

  test("useIsAdmin returns false for rep role", () => {
    expect(isAdminRole({ role: "rep" })).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });

  test("schema editor blocks non-admin users", () => {
    // The editor renders its permission gate when canEditSchema is false.
    expect(canEditSchema({ role: "admin" })).toBe(true);
    expect(canEditSchema({ role: "rep" })).toBe(false);
    expect(canEditSchema(null)).toBe(false);
  });
});
