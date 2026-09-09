import type { GitRepo } from "@/types";

import { NavigationEffects } from "./components/history/NavigationEffects";
import { SearchBar } from "./components/history/SearchBar";
import { WorkspacePane } from "./components/history/WorkspacePane";
import { RepositoryStatus } from "./components/repository/RepositoryStatus";
import { ContextMenu } from "./components/ui/ContextMenu";
import { Dialog } from "./components/ui/Dialog";
import { ScrollShadow } from "./components/ui/ScrollShadow";
import { GraphView } from "./layout/GraphView";
import { MainHeader } from "./layout/MainHeader";
import { workspaceVisible } from "./lib/navigation";

export function App({ repos }: { repos: Array<GitRepo> }) {
  return (
    <div class="flex min-h-screen flex-col">
      <MainHeader repos={repos} />
      <SearchBar />
      <RepositoryStatus />
      <div class="flex min-w-0 flex-1 flex-col items-start md:flex-row">
        {workspaceVisible.value && <WorkspacePane />}
        <div class="min-w-0 w-full flex-1">
          <GraphView />
        </div>
      </div>
      <NavigationEffects />
      <ScrollShadow />
      <ContextMenu />
      <Dialog />
    </div>
  );
}
