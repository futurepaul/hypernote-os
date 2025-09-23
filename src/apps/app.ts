import poast from "../../sample_apps/poast.md";
import profile from "../../sample_apps/profile.md";
import wallet from "../../sample_apps/wallet.md";
import appStore from "../../sample_apps/app-store.md";
import welcome from "../../sample_apps/welcome.md";
import appsDoc from "../../sample_apps/apps.md";

export const defaultApps: Record<string, string> = {
  // invisible apps but we need them to be here for the compiler to work
  //
  // TODO: move these apps to sample_apps as .md files once we can actually
  // define them as hypernotes
  apps: appsDoc,
  editor: `---
hypernote:
  name: Editor
  icon: edit.png
---
Edit app documents on the right; click Save to persist.
`,
  system: `---
hypernote:
  name: System Menu
  icon: settings.png
---
System-wide actions.
`,
  // visible apps in the editor
  poast,
  profile,
  wallet,
  appStore,
  welcome,
};
