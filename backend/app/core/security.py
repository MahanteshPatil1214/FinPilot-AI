"""Server-side identity boundary.

This is the single trusted source of the caller's identity for the API. Nothing
here is read from client input: the organization and user are resolved on the
server. The current implementation is a fixed single-organization development
identity, which is a documented limitation, not a security boundary. A future
milestone replaces these functions with real authentication that derives the
organization and user from a verified token/principal.

Route handlers must depend on these functions (via ``app.api.deps``) rather than
reading an organization id from a header, query string or request body. A
client-supplied organization id must never be treated as authorization.
"""

# Development identity (single organization). Not client-supplied.
_DEV_ORGANIZATION_ID = "org_1"
_DEV_USER_ID = "demo-user"


def get_current_user_id() -> str:
    """Return the authenticated user id (development: the demo user)."""
    return _DEV_USER_ID


def get_current_organization_id() -> str:
    """Return the organization the current principal may access."""
    return _DEV_ORGANIZATION_ID


def check_authentication() -> bool:
    return True
