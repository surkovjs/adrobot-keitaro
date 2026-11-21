import { createContext, useContext, type ReactNode } from 'react'
import { useWorkspaceData } from '@/app/model/use-workspace-data'

const WorkspaceContext = createContext<ReturnType<
  typeof useWorkspaceData
> | null>(null)
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspaceData()
  return (
    <WorkspaceContext.Provider value={workspace}>
      {children}
    </WorkspaceContext.Provider>
  )
}
export function useWorkspace() {
  const workspace = useContext(WorkspaceContext)
  if (!workspace) throw new Error('WorkspaceProvider is required')
  return workspace
}
