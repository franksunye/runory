// This is the single composition root for built-in semantic effect Providers.
// Keep registration explicit here so inventory and Runtime behavior do not
// depend on unrelated feature modules being imported first.
import "./assignment";
import "./forms";
import "./fsm";
import "./invoice";
import "./quote";
import "./scheduling";
import "./workflow";
