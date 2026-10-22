from django.urls import path
from . import views as v

U = "applications/<uuid:pk>"
urlpatterns = [
    path("applications", v.ApplicationList.as_view()),
    path(U, v.ApplicationDetail.as_view()),
    path(f"{U}/onboarding", v.StageView.as_view(step=1)),   # PATCH  Stage 1
    path(f"{U}/screening", v.StageView.as_view(step=2)),    # POST   Stage 2 (CDD)
    path(f"{U}/valuations", v.StageView.as_view(step=3)),   # POST   Stage 3 (collateral, valuation notes)
    path(f"{U}/facility", v.StageView.as_view(step=4)),     # PATCH  Stage 4
    path(f"{U}/assessments", v.AssessmentView.as_view()),   # POST   Stage 5 (calls decision-service)
    path(f"{U}/pricing", v.PricingView.as_view()),          # GET
    path(f"{U}/walr", v.WalrView.as_view()),                # GET  weighted average lending rates
    path(f"{U}/confirmations", v.StageView.as_view(step=6)),  # POST Stage 6
    path(f"{U}/documents", v.DocumentView.as_view()),       # POST   Stage 7 upload / verify / reject
    path(f"{U}/integrations/<str:name>", v.IntegrationView.as_view()),  # POST erp|crib|screening|fourn|valuation
    path(f"{U}/transitions", v.TransitionView.as_view()),   # POST   advance, submit, accept, qa_*, approve, reject ...
    path(f"{U}/timeline", v.TimelineView.as_view()),        # GET
    path(f"{U}/files", v.FileUpload.as_view()),             # POST multipart
    path("files/<uuid:fid>", v.FileDownload.as_view()),     # GET
    path("public/review/<str:token>", v.ReviewPublic.as_view()),  # GET / POST, no login
]
