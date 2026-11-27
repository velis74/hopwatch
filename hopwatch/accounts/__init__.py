"""
User accounts. Login, signup, logout and social login are allauth headless endpoints under `/_allauth/`.

Browser client (`/_allauth/browser/v1/...`, same origin as the app):

- Any `GET` to it, e.g. `config` or `auth/session` at start-up, sets the `csrftoken` cookie.
- Every `POST` and `DELETE` sends that cookie's current value in the `X-CSRFToken` header. Login and signup rotate
  the token, so the header is read from the cookie for each request, never cached.
- The provider redirect is a regular form `POST` to `auth/provider/redirect` with the fields `provider`,
  `callback_url`, `process=login` and `csrfmiddlewaretoken`.
- The resulting `sessionid` cookie also authenticates `/api/v1`.

App client (`/_allauth/app/v1/...`, no CSRF): sends `X-Session-Token: <meta.session_token>` to allauth and to
`/api/v1`. Native social login posts the provider's ID token to `auth/provider/token`.
"""
