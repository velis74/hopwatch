from allauth.socialaccount.adapter import DefaultSocialAccountAdapter


class SocialAccountAdapter(DefaultSocialAccountAdapter):
    """Leaves apps with the `hidden` setting out of the provider listing; the token flow still accepts them."""

    def list_providers(self, request):
        return [
            provider
            for provider in super().list_providers(request)
            if not (provider.uses_apps and provider.app.settings.get("hidden"))
        ]
