"""
Django settings of Hopwatch. Every deployment-specific value comes from an environment variable; the defaults
are for local development.
"""

import os

from pathlib import Path

import dj_database_url

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: list[str]) -> list[str]:
    value = os.environ.get(name)
    if value is None:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


DEBUG = env_bool("DEBUG", True)
if not DEBUG and not os.environ.get("DJANGO_SECRET_KEY"):
    raise ImproperlyConfigured("DJANGO_SECRET_KEY is required when DEBUG is off")
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "django-insecure-hopwatch-local-development-only")
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = env_bool("SECURE_COOKIES", not DEBUG)
if env_bool("BEHIND_TLS_PROXY", False):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", ["127.0.0.1", "localhost"])
CSRF_TRUSTED_ORIGINS = env_list(
    "CSRF_TRUSTED_ORIGINS",
    ["http://127.0.0.1:5180", "http://localhost:5180"],
)

# Base URL of the Vue app; allauth links in emails and provider redirects point at its routes.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://127.0.0.1:5180").rstrip("/")

# MOTIS instance that serves timetables and real-time data.
MOTIS_URL = os.environ.get("MOTIS_URL", "http://127.0.0.1:8180").rstrip("/")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "hopwatch.accounts",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "allauth.socialaccount.providers.apple",
    "allauth.headless",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

ROOT_URLCONF = "hopwatch.urls"
WSGI_APPLICATION = "hopwatch.wsgi.application"
ASGI_APPLICATION = "hopwatch.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'var' / 'db.sqlite3'}",
        conn_max_age=0,
    ),
}
if DATABASES["default"]["ENGINE"] == "django.db.backends.sqlite3":
    (BASE_DIR / "var").mkdir(exist_ok=True)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-gb"
TIME_ZONE = "Europe/Ljubljana"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "var" / "static"

EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")

# allauth: email address as the login, no username; headless API only.
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*", "password2*"]
ACCOUNT_UNIQUE_EMAIL = True
ACCOUNT_EMAIL_VERIFICATION = "none"
# Email addresses are not verified, so a social login never logs into or connects to a local account by email.
SOCIALACCOUNT_EMAIL_AUTHENTICATION = False
SOCIALACCOUNT_ADAPTER = "hopwatch.accounts.adapter.SocialAccountAdapter"

HEADLESS_ONLY = True
HEADLESS_CLIENTS = ("browser", "app")
HEADLESS_FRONTEND_URLS = {
    "account_confirm_email": f"{FRONTEND_URL}/account/verify-email/{{key}}",
    "account_reset_password": f"{FRONTEND_URL}/account/password/reset",
    "account_reset_password_from_key": f"{FRONTEND_URL}/account/password/reset/key/{{key}}",
    "account_signup": f"{FRONTEND_URL}/signup",
    "socialaccount_login_error": f"{FRONTEND_URL}/login",
}


def social_providers() -> dict:
    """
    Google and Apple, each only when all of its environment variables are set.

    Both offer the browser redirect flow and the app client's token flow (`/_allauth/app/v1/auth/provider/token`,
    an ID token obtained by the native SDK). Google: the token's audience is `GOOGLE_CLIENT_ID` (the web client ID
    requested as the server client ID), or one of `GOOGLE_MOBILE_CLIENT_IDS` (comma-separated native client IDs,
    hidden from the config endpoint; the app sends the one it used as `client_id`). Apple: `APPLE_CLIENT_ID` is the
    Services ID, optionally followed by the app's bundle ID, comma-separated; the token's audience may be either.
    """
    providers = {}
    google_id = os.environ.get("GOOGLE_CLIENT_ID")
    google_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    if google_id and google_secret:
        mobile_apps = [
            {"client_id": client_id, "secret": "", "key": "", "settings": {"hidden": True}}
            for client_id in env_list("GOOGLE_MOBILE_CLIENT_IDS", [])
        ]
        providers["google"] = {
            "APPS": [{"client_id": google_id, "secret": google_secret, "key": ""}, *mobile_apps],
            "SCOPE": ["profile", "email"],
            "AUTH_PARAMS": {"access_type": "online"},
        }
    apple = {name: os.environ.get(f"APPLE_{name}") for name in ("CLIENT_ID", "TEAM_ID", "KEY_ID", "PRIVATE_KEY")}
    if all(apple.values()):
        providers["apple"] = {
            "APPS": [
                {
                    "client_id": apple["CLIENT_ID"],
                    "secret": apple["KEY_ID"],
                    "key": apple["TEAM_ID"],
                    # Environment variables often carry the PEM key with escaped newlines.
                    "settings": {"certificate_key": apple["PRIVATE_KEY"].replace("\\n", "\n")},
                }
            ],
        }
    return providers


SOCIALACCOUNT_PROVIDERS = social_providers()

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
}
