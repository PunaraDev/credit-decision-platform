from django.urls import path
from . import views

urlpatterns = [
    path("decisions/assess", views.AssessView.as_view()),
    path("decisions/schedule", views.ScheduleView.as_view()),
    path("decisions/policy", views.PolicyView.as_view()),
    path("decisions/history/<str:application_id>", views.HistoryView.as_view()),
]
