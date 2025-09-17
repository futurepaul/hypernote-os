import { DraggableWindow } from "./DraggableWindow";
import type { WindowId } from "../store/windows";
import { AppView } from "./AppView";
import { useWindows } from "../store/windows";

export function WalletWindow() {
  const { windows } = useWindows();
  return (
    <DraggableWindow id={"wallet" as WindowId} title={windows.wallet.title}>
      <AppView id="wallet" />
    </DraggableWindow>
  );
}
