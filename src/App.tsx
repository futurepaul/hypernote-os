import "./index.css";
import { ProfileWindow } from "./components/ProfileWindow";
import { WalletWindow } from "./components/WalletWindow";
import { ClockWindow } from "./components/ClockWindow";
import { SwitcherWindow } from "./components/SwitcherWindow";
import { EditorWindow } from "./components/EditorWindow";
import { useWindows } from "./store/windows";
import { useEffect } from "react";

export function App() {
  const { setTimeNow } = useWindows();
  useEffect(() => {
    const t = setInterval(() => setTimeNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [setTimeNow]);
  // Hydrate .md app docs if dev imported as asset URLs
  const { hydrateDocsFromAssets } = useWindows();
  useEffect(() => {
    hydrateDocsFromAssets();
  }, [hydrateDocsFromAssets]);
  return (
    <main className="min-h-screen text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold">Hypernote</h1>
        <p className="mt-3 text-gray-600">
          Frontend is running with plain Tailwind on port 3420.
        </p>
      </div>
      <ProfileWindow />
      <WalletWindow />
      <ClockWindow />
      <EditorWindow />
      <SwitcherWindow />
    </main>
  );
}

export default App;
