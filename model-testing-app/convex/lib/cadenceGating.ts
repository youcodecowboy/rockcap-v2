// Pure gating predicate for the cadence dispatcher (cadenceDispatcher.tick →
// cadences.findDueInternal). Kept free of Convex imports so it is unit-testable
// under vitest (this repo has no convex-test).
//
// The rule: a PACKAGE member (has a packageId) may only fire once its package
// has been approved (packageApprovalStatus === "approved", set by
// cadences.approvePackage). A pending / denied / needs_contact / undefined
// package member must NOT fire. Non-package (recurring) cadences have no
// package-approval gate, so an undefined status is fine for them.
//
// History: previously findDueInternal treated `undefined` as approved for ALL
// rows (a back-compat shortcut). That let a freshly-created, never-approved
// package member stage itself, because createInternal left packageApprovalStatus
// undefined on with-contact rows. Both ends are now fixed.

export function isCadenceFireable(row: {
  packageId?: string;
  packageApprovalStatus?: string;
}): boolean {
  if (row.packageId) {
    return row.packageApprovalStatus === "approved";
  }
  return (
    row.packageApprovalStatus === undefined ||
    row.packageApprovalStatus === "approved"
  );
}
