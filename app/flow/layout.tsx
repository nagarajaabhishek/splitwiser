import { FlowProvider } from "@/lib/flow/context";
import { FlowShell } from "@/components/FlowShell";

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <FlowProvider>
      <FlowShell>{children}</FlowShell>
    </FlowProvider>
  );
}
