from __future__ import annotations

from uuid import UUID

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, status

from mr_review.api.schemas.hosts import CreateHostRequest, HostResponse, TestConnectionResponse, UpdateHostRequest
from mr_review.core.hosts.entities import Host
from mr_review.use_cases.hosts.create_host import CreateHostUseCase
from mr_review.use_cases.hosts.delete_host import DeleteHostUseCase
from mr_review.use_cases.hosts.list_hosts import ListHostsUseCase
from mr_review.use_cases.hosts.test_connection import TestConnectionUseCase
from mr_review.use_cases.hosts.toggle_favourite_repo import ToggleFavouriteRepoUseCase
from mr_review.use_cases.hosts.update_host import UpdateHostUseCase

router = APIRouter(prefix="/api/v1/hosts", tags=["hosts"], route_class=DishkaRoute)


def _host_to_response(host: Host) -> HostResponse:
    return HostResponse(
        id=host.id,
        name=host.name,
        type=host.type,
        base_url=host.base_url,
        color=host.color,
        favourite_repos=host.favourite_repos,
        timeout=host.timeout,
        created_at=host.created_at,
    )


@router.get("", response_model=list[HostResponse])
async def list_hosts(use_case: FromDishka[ListHostsUseCase]) -> list[HostResponse]:
    hosts = await use_case.execute()
    return [_host_to_response(h) for h in hosts]


@router.post("", response_model=HostResponse, status_code=status.HTTP_201_CREATED)
async def create_host(
    body: CreateHostRequest,
    use_case: FromDishka[CreateHostUseCase],
) -> HostResponse:
    host = await use_case.execute(
        name=body.name,
        type_=body.type,
        base_url=body.base_url,
        token=body.token,
        color=body.color,
        timeout=body.timeout,
    )
    return _host_to_response(host)


@router.patch("/{host_id}", response_model=HostResponse)
async def update_host(
    host_id: UUID,
    body: UpdateHostRequest,
    use_case: FromDishka[UpdateHostUseCase],
) -> HostResponse:
    host = await use_case.execute(
        host_id,
        name=body.name,
        base_url=body.base_url,
        token=body.token,
        color=body.color,
        timeout=body.timeout,
    )
    if host is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Host not found")
    return _host_to_response(host)


@router.delete("/{host_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_host(
    host_id: UUID,
    use_case: FromDishka[DeleteHostUseCase],
) -> None:
    deleted = await use_case.execute(host_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Host not found")


@router.post("/{host_id}/favourite-repos/{repo_path:path}", response_model=HostResponse)
async def toggle_favourite_repo(
    host_id: UUID,
    repo_path: str,
    use_case: FromDishka[ToggleFavouriteRepoUseCase],
) -> HostResponse:
    try:
        host = await use_case.execute(host_id=host_id, repo_path=repo_path)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _host_to_response(host)


@router.get("/{host_id}/test", response_model=TestConnectionResponse)
async def test_host_connection(
    host_id: UUID,
    use_case: FromDishka[TestConnectionUseCase],
) -> TestConnectionResponse:
    try:
        result = await use_case.execute(host_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Connection failed: {exc}",
        ) from exc
    return TestConnectionResponse(**result)
