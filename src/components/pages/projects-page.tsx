"use client";

import { useState } from "react";
import { useApiData, useApiMutation } from "@/hooks/use-api-data";
import { AppTopbar } from "@/components/app/app-topbar";
import { PageLoading } from "@/components/shared/loading";
import { PageError } from "@/components/shared/error";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/shared/button";
import { Dialog, ConfirmDialog } from "@/components/shared/dialog";
import { projectStatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils/formatters";
import { CreateProjectForm } from "@/components/forms/project-form";
import { EditProjectForm } from "@/components/forms/edit-forms";
import type { ProjectsPagePayload } from "@/lib/services/page-payload-service";

type Project = ProjectsPagePayload["projects"][number];

export function ProjectsPage() {
  const { data, isLoading, isError, error, refetch } =
    useApiData<ProjectsPagePayload>("/api/pages/projects");

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Project | null>(null);

  const archiveMutation = useApiMutation<Record<string, never>, unknown>(
    archiveTarget ? `/api/projects/${archiveTarget.id}/archive` : "",
    "POST"
  );

  async function handleArchive() {
    if (!archiveTarget) return;
    const result = await archiveMutation.mutate({});
    if (result.ok) { setArchiveTarget(null); refetch(); }
  }

  const columns = [
    {
      key: "title",
      header: "Title",
      render: (p: Project) => (
        <div>
          <p className="text-sm font-medium">{p.title}</p>
          {p.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (p: Project) => projectStatusBadge(p.status),
    },
    {
      key: "owner",
      header: "Owner",
      render: (p: Project) => (
        <span className="text-sm text-muted-foreground">{p.owner ?? "—"}</span>
      ),
    },
    {
      key: "due",
      header: "Due Date",
      render: (p: Project) => (
        <span className="text-sm text-muted-foreground">{formatDate(p.dueDate)}</span>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      render: (p: Project) => (
        <span className="tabular-nums text-sm text-muted-foreground">{p.priority}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (p: Project) => (
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditTarget(p); }}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setArchiveTarget(p); }} className="text-destructive hover:text-destructive">Archive</Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <AppTopbar
        title="Projects"
        actions={<Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>+ New Project</Button>}
      />
      <main className="flex-1 overflow-y-auto p-6">
        {isLoading && <PageLoading />}
        {isError && <PageError message={error ?? undefined} onRetry={refetch} />}
        {data && data.projects.length === 0 && (
          <EmptyState title="No projects" description="Track internal business execution tasks." action={<button onClick={() => setCreateOpen(true)} className="text-sm font-medium text-primary hover:underline">+ New Project</button>} />
        )}
        {data && data.projects.length > 0 && (
          <DataTable columns={columns} rows={data.projects} getKey={(p) => p.id} />
        )}
      </main>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New Project">
        <CreateProjectForm onSuccess={() => { setCreateOpen(false); refetch(); }} onCancel={() => setCreateOpen(false)} />
      </Dialog>

      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Project">
        {editTarget && (
          <EditProjectForm
            id={editTarget.id}
            initial={{
              title: editTarget.title,
              description: editTarget.description,
              status: editTarget.status,
              owner: editTarget.owner,
              dueDate: editTarget.dueDate,
              priority: editTarget.priority,
            }}
            onSuccess={() => { setEditTarget(null); refetch(); }}
            onCancel={() => setEditTarget(null)}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
        title="Archive project?"
        description={archiveTarget ? `"${archiveTarget.title}" will be set to Archived and hidden from all active views.` : ""}
        confirmLabel="Archive"
        destructive
        loading={archiveMutation.isLoading}
      />
    </>
  );
}
