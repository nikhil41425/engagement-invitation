import Invitation from "@/components/Invitation";
import { body, display } from "@/lib/fonts";

export default function Page() {
  // The panel artwork is drawn to canvases, which need the resolved family
  // names rather than the CSS variables.
  return (
    <Invitation displayFamily={display.style.fontFamily} bodyFamily={body.style.fontFamily} />
  );
}
