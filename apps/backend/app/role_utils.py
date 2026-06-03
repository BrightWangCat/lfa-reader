from sqlalchemy import inspect as sa_inspect, text


USER_ROLE = "user"
ADMIN_ROLE = "admin"
LEGACY_SINGLE_ROLE = "single"
LEGACY_BATCH_ROLE = "batch"
VALID_USER_ROLES = (USER_ROLE, ADMIN_ROLE)


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
