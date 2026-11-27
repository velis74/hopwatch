"""URLs served by Django: the social providers' callbacks and the admin. The API is the FastAPI application."""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("accounts/", include("allauth.urls")),
    path("admin/", admin.site.urls),
]
