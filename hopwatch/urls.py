"""URLs served by Django: allauth headless API, provider callbacks and the admin."""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("_allauth/", include("allauth.headless.urls")),
    path("accounts/", include("allauth.urls")),
    path("admin/", admin.site.urls),
]
