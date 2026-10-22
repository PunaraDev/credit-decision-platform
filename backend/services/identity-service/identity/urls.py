from django.urls import path
from . import views as v

urlpatterns = [
    path("auth/login", v.LoginView.as_view()),
    path("auth/verify", v.VerifyView.as_view()),
    path("auth/logout", v.LogoutView.as_view()),
    path("auth/me", v.MeView.as_view()),
    path("auth/change-password", v.ChangePasswordView.as_view()),
    path("auth/users", v.UserList.as_view()),
    path("auth/users/<uuid:pk>", v.UserDetail.as_view()),
    path("auth/security-log", v.SecurityLog.as_view()),
]
