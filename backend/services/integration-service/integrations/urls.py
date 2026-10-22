from django.urls import path
from . import views as v

urlpatterns = [
    path("integrations/mode", v.ModeView.as_view()),
    path("integrations/erp/search", v.ErpSearch.as_view()),
    path("integrations/crib/inquiry", v.CribInquiry.as_view()),
    path("integrations/screening/run", v.ScreeningRun.as_view()),
    path("integrations/fourn/send", v.FourNSend.as_view()),
    path("integrations/sms/send", v.SmsSend.as_view()),
    path("integrations/valuation/request", v.ValuationRequest.as_view()),
]
