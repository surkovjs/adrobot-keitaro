import { WorkspaceProvider } from '@/app/providers/workspace-provider'
import AppLayout from '@/app/layout/app-layout'

export default function App() {
  return (
    <WorkspaceProvider>
      <AppLayout />
    </WorkspaceProvider>
  )
}
