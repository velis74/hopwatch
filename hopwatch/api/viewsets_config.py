"""
Global fastapi-viewsets settings. Imported before any viewset is decorated: the library reads them at decoration
time.

Every action is public by default; an action that needs a logged-in user sets
`@action_configuration({Session: True})`.
"""

from fastapi_viewsets.conf import settings as viewsets_settings
from fastapi_viewsets.context.auth import auth_context_processor
from fastapi_viewsets.context.auth.django import DjangoSessionAuthBackend, DjangoSessionCookieAuthBackend
from fastapi_viewsets.middleware.auth import Session

viewsets_settings.viewsets_context_processors = [auth_context_processor]
# The app client (allauth headless "app") sends the session key in X-Session-Token; the browser sends the
# session cookie.
viewsets_settings.viewsets_auth_processors = [DjangoSessionAuthBackend(), DjangoSessionCookieAuthBackend()]
viewsets_settings.viewsets_command_middleware = [Session()]
viewsets_settings.default_action_configuration = {Session: False}
