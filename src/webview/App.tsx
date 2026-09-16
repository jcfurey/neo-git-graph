import type { GitRepo } from "@/types";

import { NavigationEffects } from "./components/history/NavigationEffects";
import { SearchBar } from "./components/history/SearchBar";
import { WorkspacePane } from "./components/history/WorkspacePane";
import { RefsPane } from "./components/repository/RefsPane";
import { RepositoryStatus } from "./components/repository/RepositoryStatus";
import { ContextMenu } from "./components/ui/ContextMenu";
import { Dialog } from "./components/ui/Dialog";
import { ScrollShadow } from "./components/ui/ScrollShadow";
import { GraphView } from "./layout/GraphView";
import { MainHeader } from "./layout/MainHeader";
import { historyActive, refsVisible, searchVisible, workspaceVisible } from "./lib/navigation";

export function App({ repos }: { repos: Array<GitRepo> }) {
  const sidebar = refsVisible.value || workspaceVisible.value;
  return (
    <div data-git-graph class="flex min-h-screen flex-col">
      <MainHeader repos={repos} />
      {(searchVisible.value || historyActive.value) && <SearchBar />}
      <RepositoryStatus />
      <div class="flex min-w-0 flex-1 flex-col items-start md:flex-row">
        {sidebar && (
          <div class="flex w-full shrink-0 flex-col border-r border-line-soft md:sticky md:top-12 md:h-[calc(100vh-3rem)] md:w-72 md:max-w-[40vw]">
            {refsVisible.value && <RefsPane />}
            {workspaceVisible.value && <WorkspacePane />}
          </div>
        )}
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
