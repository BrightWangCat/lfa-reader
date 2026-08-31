from sqlalchemy import inspect as sa_inspect, text


USER_ROLE = "user"
DOCTOR_ROLE = "doctor"
ADMIN_ROLE = "admin"
LEGACY_SINGLE_ROLE = "single"
LEGACY_BATCH_ROLE = "batch"
VALID_USER_ROLES = (USER_ROLE, DOCTOR_ROLE, ADMIN_ROLE)
# Roles with full clinical visibility: read and correct every reading, and see
# the full statistics views. User management stays admin-only.
CLINICAL_ROLES = (DOCTOR_ROLE, ADMIN_ROLE)


def migrate_users_doctor_application(eng):
    """Add users.doctor_application_status when missing.

    Additive and idempotent: the column is created only if absent, existing
    rows keep NULL (never applied), and no row is ever rewritten.
    """
    insp = sa_inspect(eng)
    if "users" not in insp.get_table_names():
        return

    columns = {c["name"] for c in insp.get_columns("users")}
    if "doctor_application_status" in columns:
        return

    with eng.begin() as conn:
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN doctor_application_status TEXT"
        ))


def migrate_legacy_user_roles(eng):
    """Rename legacy regular-user roles to the current user role value."""
    insp = sa_inspect(eng)
    if "users" not in insp.get_table_names():
        return

    columns = {c["name"] for c in insp.get_columns("users")}
    if "role" not in columns:
        return

    with eng.begin() as conn:
        conn.execute(
            text(
                "UPDATE users SET role=:new_role "
                "WHERE role IN (:single_role, :batch_role)"
            ),
            {
                "new_role": USER_ROLE,
                "single_role": LEGACY_SINGLE_ROLE,
                "batch_role": LEGACY_BATCH_ROLE,
            },
        )
