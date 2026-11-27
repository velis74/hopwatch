from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """A Hopwatch account. Users sign in with their email address or a social account."""
