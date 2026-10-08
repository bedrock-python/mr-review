"""Export and import between real data directories."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.export_import import encryption
from mr_review.core.export_import.entities import (
    ExportData,
    ExportRequest,
    ImportRequest,
    MergeStrategy,
    PackagedAIProvider,
    PackagedHost,
)
from mr_review.core.export_import.errors import DamagedPackageError, PassphraseRequiredError, WrongPassphraseError
from mr_review.core.hosts.entities import Host
from mr_review.core.reviews.entities import BriefConfig, BriefPreset, IterationStage, Review
from mr_review.core.reviews.sources import BranchDiffSource
from mr_review.infra.repositories.ai_provider import FileAIProviderRepository
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.use_cases.export_data import ExportDataUseCase
from mr_review.use_cases.import_data import ImportDataUseCase
from pydantic import SecretStr, ValidationError

from tests.factories.entities import make_comment, make_iteration, make_review

pytestmark = pytest.mark.integration

_PASSPHRASE = SecretStr("correct horse battery staple")


@dataclass
class Store:
    hosts: FileHostRepository
    providers: FileAIProviderRepository
    reviews: FileReviewRepository

    @classmethod
    def at(cls, path: Path) -> Store:
        return cls(FileHostRepository(path), FileAIProviderRepository(path), FileReviewRepository(path))

    async def export(self, **kwargs: object) -> ExportData:
        return await ExportDataUseCase(self.hosts, self.providers, self.reviews).execute(ExportRequest(**kwargs))

    async def import_(self, data: ExportData, strategy: MergeStrategy = "skip", password: SecretStr | None = None):
        request = ImportRequest(data=data, merge_strategy=strategy, decryption_password=password)
        return await ImportDataUseCase(self.hosts, self.providers, self.reviews).execute(request)

    async def snapshot(self) -> tuple[list[Host], list[AIProvider], list[Review]]:
        return await self.hosts.list_all(), await self.providers.list_all(), await self.reviews.list_all_uncapped()


@pytest.fixture
def source(tmp_path: Path) -> Store:
    return Store.at(tmp_path / "source")


@pytest.fixture
def target(tmp_path: Path) -> Store:
    return Store.at(tmp_path / "target")


async def _populate(store: Store) -> tuple[Host, AIProvider, Review]:
    host = await store.hosts.create(name="gl", type_="gitlab", base_url="https://gl.example", token="glpat-SECRET")
    host = await store.hosts.set_favourite_repos(host.id, ["grp/a", "grp/b"]) or host
    provider = await store.providers.create(
        name="oa", type_="openai", api_key="sk-SECRET", base_url="", models=["gpt-4o", "o3"], max_concurrent=2
    )
    review = await store.reviews.create(host_id=host.id, repo_path="grp/a", mr_iid=7)
    iteration = make_iteration(
        stage=IterationStage.polish,
        ai_provider_id=provider.id,
        model="gpt-4o",
        brief_config=BriefConfig(preset=BriefPreset.security, custom_instructions="SQL injection"),
        comments=[make_comment(body="bug here", severity="major"), make_comment(body="nit", status="dismissed")],
    )
    review = await store.reviews.update(review.model_copy(update={"iterations": [iteration]}))
    return host, provider, review


async def test__export_then_import__into_an_empty_store__reproduces_every_record(source: Store, target: Store) -> None:
    await _populate(source)
    await source.reviews.create_from_source(
        host_id=uuid4(), repo_path="g/p", source=BranchDiffSource(base_ref="main", head_ref="feat", title="t")
    )
    package = await source.export(include_plain_secrets=True)

    result = await target.import_(package)

    assert await target.snapshot() == await source.snapshot()
    assert (result.hosts_imported, result.ai_providers_imported, result.reviews_imported) == (1, 1, 2)
    assert result.errors == []


async def test__import__same_file_twice__never_duplicates(source: Store, target: Store) -> None:
    await _populate(source)
    package = await source.export(include_plain_secrets=True)

    for strategy in ("skip", "merge", "replace", "skip"):
        await target.import_(package, strategy)

    hosts, providers, reviews = await target.snapshot()
    assert (len(hosts), len(providers), len(reviews)) == (1, 1, 1)


@pytest.mark.parametrize("strategy", ["skip", "merge", "replace"])
async def test__import__identical_records__count_as_skipped(source: Store, strategy: MergeStrategy) -> None:
    await _populate(source)
    package = await source.export(include_plain_secrets=True)

    result = await source.import_(package, strategy)

    assert (result.hosts_skipped, result.ai_providers_skipped, result.reviews_skipped) == (1, 1, 1)
    assert result.hosts_imported == result.hosts_updated == 0


async def test__import_replace__wrong_passphrase__rejects_and_changes_nothing(source: Store) -> None:
    await _populate(source)
    package = await source.export(encryption_password=_PASSPHRASE)
    before = await source.snapshot()

    with pytest.raises(WrongPassphraseError):
        await source.import_(package, "replace", SecretStr("wrong"))

    assert await source.snapshot() == before


async def test__import_replace__right_passphrase__keeps_ids_so_reviews_keep_their_host(
    source: Store, target: Store
) -> None:
    host, provider, review = await _populate(source)
    package = await source.export(encryption_password=_PASSPHRASE)
    await target.import_(package, "skip", _PASSPHRASE)
    await target.hosts.update(host.id, name="renamed locally")

    result = await target.import_(package, "replace", _PASSPHRASE)

    hosts, providers, reviews = await target.snapshot()
    assert [h.id for h in hosts] == [host.id]
    assert hosts[0].name == "gl"
    assert hosts[0].token.get_secret_value() == "glpat-SECRET"
    assert hosts[0].favourite_repos == ["grp/a", "grp/b"]
    assert [p.api_key.get_secret_value() for p in providers] == ["sk-SECRET"]
    assert reviews[0].host_id == host.id
    assert reviews[0].iterations[0].ai_provider_id == provider.id
    assert result.hosts_updated == 1


async def test__import_merge__keeps_local_only_data(source: Store, target: Store) -> None:
    host, provider, review = await _populate(source)
    package = await source.export()  # without secrets
    await target.import_(await source.export(include_plain_secrets=True))
    await target.hosts.set_favourite_repos(host.id, ["local/only", "grp/a"])
    await target.hosts.update(host.id, token="local-token")
    await target.providers.update(provider.id, models=["local-model"])
    newer_local = await target.reviews.update_with(review.id, lambda r: r.model_copy(update={"repo_path": "local"}))
    assert newer_local is not None

    result = await target.import_(package, "merge")

    stored_host = await target.hosts.get_by_id(host.id)
    assert stored_host is not None
    assert stored_host.favourite_repos == ["local/only", "grp/a", "grp/b"]
    assert stored_host.token.get_secret_value() == "local-token"
    stored_provider = await target.providers.get_by_id(provider.id)
    assert stored_provider is not None
    assert stored_provider.models == ["gpt-4o", "o3", "local-model"]
    assert stored_provider.api_key.get_secret_value() == "sk-SECRET"
    assert await target.reviews.get_by_id(review.id) == newer_local  # the newer local version wins
    assert result.reviews_skipped == 1


async def test__import_merge__newer_review_in_the_file__wins(source: Store, target: Store) -> None:
    _, _, review = await _populate(source)
    await target.import_(await source.export())
    edited = await source.reviews.update_with(review.id, lambda r: r.model_copy(update={"iterations": []}))
    assert edited is not None

    result = await target.import_(await source.export(), "merge")

    stored = await target.reviews.get_by_id(review.id)
    assert stored is not None
    assert stored.iterations == []
    assert stored.updated_at == edited.updated_at
    assert stored.created_at == review.created_at
    assert result.reviews_updated == 1


async def test__import_replace__overwrites_local_changes_but_keeps_a_secret_the_file_lacks(
    source: Store, target: Store
) -> None:
    host, _, review = await _populate(source)
    await target.import_(await source.export(include_plain_secrets=True))
    await target.hosts.set_favourite_repos(host.id, ["local/only"])
    await target.reviews.update_with(review.id, lambda r: r.model_copy(update={"iterations": []}))

    await target.import_(await source.export(), "replace")

    stored_host = await target.hosts.get_by_id(host.id)
    assert stored_host is not None
    assert stored_host.favourite_repos == ["grp/a", "grp/b"]
    assert stored_host.token.get_secret_value() == "glpat-SECRET"
    stored_review = await target.reviews.get_by_id(review.id)
    assert stored_review is not None
    assert len(stored_review.iterations) == 1


async def test__import_without_secrets__into_an_empty_store__creates_records_and_warns(
    source: Store, target: Store
) -> None:
    await _populate(source)
    package = await source.export()

    result = await target.import_(package)

    hosts, providers, _ = await target.snapshot()
    assert hosts[0].token.get_secret_value() == ""
    assert providers[0].api_key.get_secret_value() == ""
    assert len(result.warnings) == 2


@pytest.mark.parametrize("secrets", ["plain", "encrypted"])
async def test__export__secret_that_was_never_set__is_written_as_absent(source: Store, secrets: str) -> None:
    """A host imported without its token has an empty one; exporting it must not carry ""."""
    await source.hosts.create(name="tokenless", type_="gitlab", base_url="https://gl.example", token="")
    await source.providers.create(name="keyless", type_="claude", api_key="", base_url="", models=[])
    options: dict[str, object] = (
        {"include_plain_secrets": True} if secrets == "plain" else {"encryption_password": _PASSPHRASE}
    )

    package = await source.export(**options)

    assert [h.token for h in package.hosts] == [None]
    assert [p.api_key for p in package.ai_providers] == [None]


@pytest.mark.parametrize("strategy", ["merge", "replace"])
@pytest.mark.parametrize("secrets", ["plain", "encrypted"])
async def test__import__empty_secret_in_the_file__keeps_the_real_local_one(
    source: Store, target: Store, strategy: MergeStrategy, secrets: str
) -> None:
    """Files written before empty secrets were dropped carry "" (or its ciphertext): that is no secret."""
    host, provider, _ = await _populate(source)
    await target.import_(await source.export(include_plain_secrets=True))
    if secrets == "plain":
        package = await source.export(include_plain_secrets=True)
        empty = SecretStr("")
        password = None
    else:
        package = await source.export(encryption_password=_PASSPHRASE)
        assert package.encryption is not None
        cipher = encryption.PackageCipher.open(_PASSPHRASE.get_secret_value(), package.encryption)
        empty = SecretStr(cipher.encrypt(""))
        password = _PASSPHRASE
    package.hosts[0].token = empty
    package.ai_providers[0].api_key = empty

    result = await target.import_(package, strategy, password)

    stored_host = await target.hosts.get_by_id(host.id)
    stored_provider = await target.providers.get_by_id(provider.id)
    assert stored_host is not None
    assert stored_provider is not None
    assert stored_host.token.get_secret_value() == "glpat-SECRET"
    assert stored_provider.api_key.get_secret_value() == "sk-SECRET"
    assert (result.hosts_updated, result.ai_providers_updated) == (0, 0)


async def test__export__more_reviews_than_the_history_page__exports_all(source: Store) -> None:
    for n in range(60):
        await source.reviews.create(host_id=uuid4(), repo_path="g/p", mr_iid=n)

    package = await source.export(include_hosts=False, include_ai_providers=False)

    assert len(package.reviews) == 60


async def test__export__no_secrets_requested__leaves_them_out(source: Store) -> None:
    await _populate(source)

    package = await source.export()

    assert package.secrets == "omitted"
    assert not package.encrypted
    assert [h.token for h in package.hosts] == [None]
    assert [p.api_key for p in package.ai_providers] == [None]


async def test__export_and_import__derive_one_key_per_file_off_the_event_loop(
    source: Store, target: Store, monkeypatch: pytest.MonkeyPatch
) -> None:
    for n in range(3):
        await source.hosts.create(name=f"h{n}", type_="gitlab", base_url="https://x", token=f"t{n}")
        await source.providers.create(name=f"p{n}", type_="claude", api_key=f"k{n}", base_url="", models=[])
    derivations: list[bool] = []
    real_derive = encryption._derive_key

    def counting_derive(*args: object, **kwargs: object) -> bytes:
        derivations.append(threading.current_thread() is threading.main_thread())
        return real_derive(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(encryption, "_derive_key", counting_derive)

    package = await source.export(encryption_password=_PASSPHRASE)
    await target.import_(package, "skip", _PASSPHRASE)

    assert derivations == [False, False]  # one per export, one per import, both in a worker thread
    assert sorted(h.token.get_secret_value() for h in await target.hosts.list_all()) == ["t0", "t1", "t2"]


async def test__import__version_1_encrypted_file__is_still_accepted(source: Store, target: Store) -> None:
    host, provider, _ = await _populate(source)
    current = await source.export(include_plain_secrets=True)
    legacy = ExportData.model_validate(
        {
            **current.model_dump(exclude={"secrets", "encryption", "hosts", "ai_providers"}),
            "version": "1.0",
            "encrypted": True,
            "hosts": [
                {**h.model_dump(), "token": encryption.encrypt_token(h.token.get_secret_value(), "pw")}
                for h in current.hosts
                if h.token is not None
            ],
            "ai_providers": [
                {**p.model_dump(), "api_key": encryption.encrypt_token(p.api_key.get_secret_value(), "pw")}
                for p in current.ai_providers
                if p.api_key is not None
            ],
        }
    )

    with pytest.raises(WrongPassphraseError):
        await target.import_(legacy, "skip", SecretStr("not pw"))
    assert await target.snapshot() == ([], [], [])

    await target.import_(legacy, "skip", SecretStr("pw"))

    assert await target.snapshot() == await source.snapshot()


async def test__import__encrypted_file_without_passphrase__is_rejected(source: Store) -> None:
    await _populate(source)
    package = await source.export(encryption_password=_PASSPHRASE)

    with pytest.raises(PassphraseRequiredError):
        await Store.at(source.hosts._path.parent / "other").import_(package)


async def test__import__damaged_secret__rejects_the_whole_file(source: Store, target: Store) -> None:
    await _populate(source)
    await source.hosts.create(name="second", type_="github", base_url="https://api.github.com", token="t2")
    package = await source.export(encryption_password=_PASSPHRASE)
    package.hosts[1].token = SecretStr("gAAAAA-not-a-token")

    with pytest.raises(DamagedPackageError):
        await target.import_(package, "skip", _PASSPHRASE)

    assert await target.snapshot() == ([], [], [])


def test__packaged_records__mirror_the_entities_field_for_field() -> None:
    """A field added to Host or AIProvider must be added to its package record too."""
    assert set(PackagedHost.model_fields) == set(Host.model_fields)
    assert set(PackagedAIProvider.model_fields) == set(AIProvider.model_fields)


@pytest.mark.parametrize(
    "overrides",
    [
        {"version": "3.0"},
        {"encrypted": True, "secrets": "plain"},
        {"encrypted": False, "encryption": {"iterations": 600_000, "salt": "c2FsdA==", "check": "x"}},
        {"encrypted": True, "encryption": {"iterations": 10**9, "salt": "c2FsdA==", "check": "x"}},
    ],
)
def test__export_data__inconsistent_or_unsupported_file__is_invalid(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        ExportData.model_validate({"exported_at": "2026-10-01T00:00:00Z", **overrides})


def test__export_data__validation_error__does_not_echo_secrets() -> None:
    record = {"id": str(uuid4()), "name": "h", "type": "gitlab-ce", "base_url": "x", "token": "glpat-LEAKME"}

    with pytest.raises(ValidationError) as excinfo:
        ExportData.model_validate({"exported_at": "2026-10-01T00:00:00Z", "hosts": [record]})

    assert "glpat-LEAKME" not in str(excinfo.value)


async def test__import__review_timestamps_and_sources__are_kept(source: Store, target: Store) -> None:
    review = make_review(
        mr_iid=0, source=BranchDiffSource(base_ref="v1", head_ref="v2", title="release"), iterations=[]
    )
    review = review.model_copy(update={"updated_at": review.created_at + timedelta(hours=3)})
    await source.reviews.upsert_with(review.id, lambda _current: review)

    await target.import_(await source.export())

    assert await target.reviews.get_by_id(review.id) == review
