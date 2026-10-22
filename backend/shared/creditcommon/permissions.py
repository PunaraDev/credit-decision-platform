from rest_framework.permissions import BasePermission


class HasContext(BasePermission):
    message = "Missing authenticated tenant, user or role."

    def has_permission(self, request, view):
        c = getattr(request, "ctx", None)
        return bool(c and c.tenant_id and c.user_id and c.role)


def roles_allowed(*names):
    """Administrator always passes. Use for command endpoints that only some roles may call."""
    allowed = set(names) | {"Administrator"}

    class _Perm(HasContext):
        message = f"Role not permitted. Allowed: {', '.join(sorted(allowed))}"

        def has_permission(self, request, view):
            return super().has_permission(request, view) and request.ctx.role in allowed

    return _Perm
