"""Sets Django up; imported before anything that imports Django models."""

import os

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hopwatch.settings")
django.setup()
