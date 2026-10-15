"""Domain exceptions shared by repositories, services and API routes."""


class DomainError(Exception):
    """Base class for expected, user-facing domain errors."""


class ReviewNotFoundError(DomainError):
    """The investigation does not exist in the caller's organization."""


class ReviewNotEligibleError(DomainError):
    """The investigation is not in a state that can be reviewed."""

    def __init__(self, status: str):
        self.status = status
        super().__init__(f"Investigation with status '{status}' is not reviewable")


class ReviewConflictError(DomainError):
    """A stale review was submitted (report version changed underneath it)."""

    def __init__(self, expected: int, current: int):
        self.expected = expected
        self.current = current
        super().__init__(
            f"Stale review: expected report_version {expected}, current is {current}"
        )
