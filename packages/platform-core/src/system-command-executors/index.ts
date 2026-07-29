// This is the single composition root for built-in system_command executors.
// Keep registration explicit here so inventory and runtime behavior do not
// depend on unrelated feature modules being imported first.
//
// New modules that define system_command workflow steps should add their
// registration file here, following the same pattern as
// command-contracts/providers/index.ts.
import "./quote";
