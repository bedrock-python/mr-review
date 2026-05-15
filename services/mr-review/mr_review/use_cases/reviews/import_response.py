from uuid import UUID

from mr_review.core.reviews.entities import ReviewStage
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.use_cases.reviews.dispatch_review import ParseResult, parse_ai_response


class ImportResponseUseCase:
    def __init__(self, review_repo: FileReviewRepository) -> None:
        self._review_repo = review_repo

    async def execute(self, review_id: UUID, raw: str) -> ParseResult:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        result = parse_ai_response(raw)

        if result.comments:
            updated = review.model_copy(update={"stage": ReviewStage.polish, "comments": result.comments})
            await self._review_repo.update(updated)

        return result
