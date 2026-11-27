"""WSGI entry point of the Django application."""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hopwatch.settings")

application = get_wsgi_application()
