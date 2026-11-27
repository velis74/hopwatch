"""
User accounts. Login, signup, logout and social login are actions of `/api/v1/account`, which run allauth's flows
(`hopwatch.accounts.flows`) in a Django request built by `hopwatch.accounts.bridge`.

Browser client (no `X-Client-Type`, same origin as the app):

- `GET /api/v1/account/session` sets the `csrftoken` cookie.
- Every `POST` sends that cookie's current value in the `X-CSRFToken` header. Login and signup rotate the token, so
  the header is read from the cookie for each request, never cached.
- `POST /api/v1/account/social/redirect` answers the provider's authorisation URL; the provider returns to
  `/accounts/<provider>/login/callback/` (Django), which redirects to the `callback_url`.
- The `sessionid` cookie authenticates every `/api/v1` call.

App client (`X-Client-Type: app`, no cookies, no CSRF): gets `session_token` from login, signup and
`POST /api/v1/account/social/token` (the provider's ID token) and sends it as `X-Session-Token`.
"""
