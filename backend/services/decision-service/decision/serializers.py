from rest_framework import serializers


class CribSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["idle", "pending", "HIT", "NO_HIT"], default="idle")
    score = serializers.FloatField(required=False, allow_null=True)
    arrears = serializers.BooleanField(default=False)


class AssessRequest(serializers.Serializer):
    applicationId = serializers.CharField()
    income = serializers.FloatField(min_value=0)
    obligations = serializers.FloatField(min_value=0, default=0)
    collateralValue = serializers.FloatField(min_value=0)
    netFacility = serializers.FloatField(min_value=0)
    capitalizedCharges = serializers.FloatField(min_value=0, default=0)
    downPayment = serializers.FloatField(min_value=0, default=0)
    lumpSum = serializers.FloatField(min_value=0, default=0)
    tenor = serializers.IntegerField(min_value=1, max_value=360)
    requestedRate = serializers.FloatField(min_value=0, max_value=100)
    screeningClear = serializers.BooleanField()
    yearsOfService = serializers.FloatField(min_value=0, default=0)
    guarantor = serializers.BooleanField(default=False)
    crib = CribSerializer(required=False)


class ScheduleRequest(serializers.Serializer):
    principal = serializers.FloatField(min_value=1)
    annualRate = serializers.FloatField(min_value=0, max_value=100)
    months = serializers.IntegerField(min_value=1, max_value=360)
    balloon = serializers.FloatField(min_value=0, default=0)
