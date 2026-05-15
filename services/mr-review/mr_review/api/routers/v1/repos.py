from __future__ import annotations

from uuid import UUID

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, Query, status

from mr_review.api.schemas.mrs import DiffFileResponse, DiffHunkResponse, DiffLineResponse, MRResponse, RepoResponse
from mr_review.core.mrs.entities import MR, DiffFile, DiffHunk, DiffLine, Repo
from mr_review.use_cases.mrs.get_mr import GetMRUseCase
from mr_review.use_cases.mrs.get_mr_diff import GetMRDiffUseCase
from mr_review.use_cases.mrs.list_mrs import ListMRsUseCase
from mr_review.use_cases.mrs.list_repos import ListReposUseCase

router = APIRouter(prefix="/api/v1/hosts/{host_id}", tags=["repos"], route_class=DishkaRoute)


def _repo_to_response(repo: Repo) -> RepoResponse:
    return RepoResponse(id=repo.id, path=repo.path, name=repo.name, description=repo.description)


def _mr_to_response(mr: MR) -> MRResponse:
    return MRResponse(
        iid=mr.iid,
        title=mr.title,
        description=mr.description,
        author=mr.author,
        source_branch=mr.source_branch,
        target_branch=mr.target_branch,
        status=mr.status,
        draft=mr.draft,
        pipeline=mr.pipeline,
        additions=mr.additions,
        deletions=mr.deletions,
        file_count=mr.file_count,
        web_url=mr.web_url,
        created_at=mr.created_at,
        updated_at=mr.updated_at,
    )


def _diff_line_to_response(line: DiffLine) -> DiffLineResponse:
    return DiffLineResponse(type=line.type, old_line=line.old_line, new_line=line.new_line, content=line.content)


def _diff_hunk_to_response(hunk: DiffHunk) -> DiffHunkResponse:
    return DiffHunkResponse(
        old_start=hunk.old_start,
        new_start=hunk.new_start,
        old_count=hunk.old_count,
        new_count=hunk.new_count,
        lines=[_diff_line_to_response(dl) for dl in hunk.lines],
    )


def _diff_file_to_response(df: DiffFile) -> DiffFileResponse:
    return DiffFileResponse(
        path=df.path,
        old_path=df.old_path,
        additions=df.additions,
        deletions=df.deletions,
        hunks=[_diff_hunk_to_response(h) for h in df.hunks],
    )


@router.get("/repos", response_model=list[RepoResponse])
async def list_repos(
    host_id: UUID,
    use_case: FromDishka[ListReposUseCase],
    q: str | None = Query(default=None),
) -> list[RepoResponse]:
    try:
        repos = await use_case.execute(host_id, query=q)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [_repo_to_response(r) for r in repos]


@router.get("/repos/{repo_path:path}/mrs", response_model=list[MRResponse])
async def list_mrs(
    host_id: UUID,
    repo_path: str,
    use_case: FromDishka[ListMRsUseCase],
    state: str = Query(default="opened"),
) -> list[MRResponse]:
    try:
        mrs = await use_case.execute(host_id=host_id, repo_path=repo_path, state=state)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [_mr_to_response(m) for m in mrs]


@router.get("/repos/{repo_path:path}/mrs/{mr_iid}", response_model=MRResponse)
async def get_mr(
    host_id: UUID,
    repo_path: str,
    mr_iid: int,
    use_case: FromDishka[GetMRUseCase],
) -> MRResponse:
    try:
        mr = await use_case.execute(host_id=host_id, repo_path=repo_path, mr_iid=mr_iid)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _mr_to_response(mr)


@router.get("/repos/{repo_path:path}/mrs/{mr_iid}/diff", response_model=list[DiffFileResponse])
async def get_mr_diff(
    host_id: UUID,
    repo_path: str,
    mr_iid: int,
    use_case: FromDishka[GetMRDiffUseCase],
) -> list[DiffFileResponse]:
    try:
        diff = await use_case.execute(host_id=host_id, repo_path=repo_path, mr_iid=mr_iid)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [_diff_file_to_response(f) for f in diff]
