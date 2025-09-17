import { DraggableWindow } from "./DraggableWindow";
import { AppView } from "./AppView";
import { useAtomValue } from 'jotai'
import { docsAtom } from '../state/appAtoms'
import { parseFrontmatterName } from '../state/docs'

export function WalletWindow() {
  const docs = useAtomValue(docsAtom)
  const title = parseFrontmatterName(docs.wallet) || 'Wallet'
  return (
    <DraggableWindow id={'wallet'} title={title}>
      <AppView id="wallet" />
    </DraggableWindow>
  );
}
