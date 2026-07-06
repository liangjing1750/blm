import { TrashEntry, WorkspaceSummary } from '../../api/api.service';

export interface OpenSpaceSummary {
  name: string;
  count: number;
}

export interface WorkspaceDocumentFilter {
  activeSpace: string;
  activeTag: string;
  query: string;
}

const DEFAULT_WORKSPACE_SPACE = '\u9ed8\u8ba4\u7a7a\u95f4';

export class OpenDocumentQuery {
  // Module intent: keep open-document querying and pagination out of the shell component.
  // Key flow: group by workspace, filter by tag/search, then page with the legacy size.
  // Boundary detail: read existing summary fields only; do not introduce data-model changes.
  readonly pageSize = 10;

  workspaceSpaces(files: WorkspaceSummary[]): OpenSpaceSummary[] {
    const counts = new Map<string, number>();
    files.forEach((file) => {
      const space = this.normalizeWorkspaceSpace(file.space);
      counts.set(space, (counts.get(space) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort(([left], [right]) => this.compareWorkspaceSpaceNames(left, right))
      .map(([name, count]) => ({ name, count }));
  }

  tags(files: WorkspaceSummary[], activeSpace: string): string[] {
    const tags = files
      .filter((file) => !activeSpace || this.normalizeWorkspaceSpace(file.space) === activeSpace)
      .flatMap((file) => this.normalizeTags(file.tags));
    return Array.from(new Set(tags)).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  filterWorkspaceFiles(files: WorkspaceSummary[], filter: WorkspaceDocumentFilter): WorkspaceSummary[] {
    const query = filter.query.trim().toLowerCase();
    return files.filter((file) => {
      const tags = this.normalizeTags(file.tags);
      const haystack = [file.name, file.title, file.author, file.date, ...tags].join(' ').toLowerCase();
      const matchesSpace = !filter.activeSpace || this.normalizeWorkspaceSpace(file.space) === filter.activeSpace;
      const matchesTag = !filter.activeTag || tags.includes(filter.activeTag);
      const matchesQuery = !query || haystack.includes(query);
      return matchesSpace && matchesTag && matchesQuery;
    });
  }

  sortTrash(entries: TrashEntry[]): TrashEntry[] {
    return entries
      .slice()
      .sort((left, right) => String(right.timestamp || right.id || '').localeCompare(String(left.timestamp || left.id || '')));
  }

  pageItems<T>(items: T[], page: number): T[] {
    const current = this.clampPage(page, this.totalPages(items.length));
    const start = (current - 1) * this.pageSize;
    return items.slice(start, start + this.pageSize);
  }

  totalPages(totalItems: number): number {
    return Math.max(1, Math.ceil((Number(totalItems) || 0) / this.pageSize));
  }

  clampPage(page: number, totalPages: number): number {
    return Math.max(1, Math.min(Math.max(1, totalPages), Number(page) || 1));
  }

  paginationLabel(page: number, totalItems: number): string {
    const totalPages = this.totalPages(totalItems);
    const current = this.clampPage(page, totalPages);
    const start = totalItems ? (current - 1) * this.pageSize + 1 : 0;
    const end = Math.min(totalItems, current * this.pageSize);
    return `\u7b2c ${current} / ${totalPages} \u9875\uff0c\u663e\u793a ${start}-${end}\uff0c\u5171 ${totalItems} \u4e2a`;
  }

  normalizeWorkspaceSpace(space: string | undefined): string {
    const value = String(space || '').trim();
    return value || DEFAULT_WORKSPACE_SPACE;
  }

  normalizeTags(tags: string[] | string | undefined): string[] {
    if (Array.isArray(tags)) {
      return tags.map((tag) => String(tag || '').trim()).filter(Boolean);
    }
    if (typeof tags === 'string') {
      return tags
        .split(/[,，、]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
    return [];
  }

  private compareWorkspaceSpaceNames(left: string, right: string): number {
    if (left === DEFAULT_WORKSPACE_SPACE && right !== DEFAULT_WORKSPACE_SPACE) return -1;
    if (right === DEFAULT_WORKSPACE_SPACE && left !== DEFAULT_WORKSPACE_SPACE) return 1;
    return left.localeCompare(right, 'zh-Hans-CN', { sensitivity: 'base' });
  }
}
