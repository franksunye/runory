// CLI-only, invoked by an authorized host operator in the application
// container. The normal OTP verification endpoint still creates the session.
import { takeConfiguredOwnerCode } from "../../../packages/platform-core/src/operator-otp";
try {
  if (process.argv.length !== 2) throw new Error("No arguments accepted");
  process.stdout.write((await takeConfiguredOwnerCode()) + "\n");
} catch {
  process.stderr.write("No current private owner code. Request a new verification code from the login page.\n");
  process.exitCode = 1;
}
