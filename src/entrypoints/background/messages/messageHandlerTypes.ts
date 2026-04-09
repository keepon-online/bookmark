import { getCurrentPageInfo } from '@/lib/messaging';
import type {
  CreateBookmarkDTO,
  CreateFolderDTO,
  CreateTagDTO,
  MessageResponse,
  UpdateBookmarkDTO,
  UpdateFolderDTO,
  UpdateTagDTO,
} from '@/types';

export type BookmarkQueryOptions = {
  folderId?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  status?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'visitCount';
  sortOrder?: 'asc' | 'desc';
};

export type BookmarkServiceLike = {
  create?: (payload: CreateBookmarkDTO) => Promise<unknown>;
  update?: (id: string, payload: UpdateBookmarkDTO) => Promise<unknown>;
  delete?: (id: string) => Promise<void>;
  deleteMany?: (ids: string[]) => Promise<void>;
  getAll?: (options?: BookmarkQueryOptions) => Promise<Array<{ id: string; url: string }>>;
  importFromBrowser?: () => Promise<unknown>;
};

export type FolderServiceLike = {
  create?: (payload: CreateFolderDTO) => Promise<unknown>;
  update?: (id: string, payload: UpdateFolderDTO) => Promise<unknown>;
  delete?: (id: string, moveBookmarksTo?: string) => Promise<void>;
  getTree?: () => Promise<unknown>;
};

export type TagServiceLike = {
  getAll?: () => Promise<unknown>;
  create?: (payload: CreateTagDTO) => Promise<unknown>;
  update?: (id: string, payload: UpdateTagDTO) => Promise<unknown>;
  delete?: (id: string) => Promise<void>;
};

export type SearchServiceLike = {
  invalidateCache?: () => void;
  search?: (query: string) => Promise<unknown>;
};

export interface BackgroundHandlerDeps {
  bookmarkService: BookmarkServiceLike;
  folderService: FolderServiceLike;
  tagService: TagServiceLike;
  searchService: SearchServiceLike;
  getCurrentPageInfo: typeof getCurrentPageInfo;
}

export function success(data: unknown, requestId?: string): MessageResponse {
  return {
    success: true,
    data,
    requestId,
  };
}

export function failure(error: string, requestId?: string): MessageResponse {
  return {
    success: false,
    error,
    requestId,
  };
}
