import { DraggableWindow } from "./DraggableWindow";
import type { WindowId } from "../store/windows";
import { AppView } from "./AppView";
import { useWindows } from "../store/windows";

export function ClockWindow() {
  const { windows } = useWindows();
  return (
    <DraggableWindow id={"clock" as WindowId} title={windows.clock.title}>
      <AppView id="clock" />
    </DraggableWindow>
  );
}
