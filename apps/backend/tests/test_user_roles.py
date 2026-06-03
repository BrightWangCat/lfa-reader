import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Base, User
from app.routers.users import SetRoleRequest, set_user_role
from app.schemas import UserResponse
from app.role_utils import migrate_legacy_user_roles


class UserRoleTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=self.engine,
        )

    def tearDown(self):
        self.engine.dispose()

    def test_new_users_default_to_user_role(self):
        db = self.SessionLocal()
        try:
            user = User(
                email="regular@example.com",
                username="regular",
                hashed_password="hashed",
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            self.assertEqual(user.role, "user")
            self.assertEqual(UserResponse.model_validate(user).role, "user")
        finally:
            db.close()

    def test_admin_can_assign_user_role(self):
        db = self.SessionLocal()
        try:
            admin = User(
                email="admin@example.com",
                username="admin",
                hashed_password="hashed",
                role="admin",
            )
            target = User(
                email="target@example.com",
                username="target",
                hashed_password="hashed",
                role="admin",
            )
            db.add_all([admin, target])
            db.commit()
            db.refresh(admin)
            db.refresh(target)

            updated = set_user_role(
                target.id,
                SetRoleRequest(role="user"),
                current_user=admin,
                db=db,
            )

            self.assertEqual(updated.role, "user")
        finally:
            db.close()

    def test_single_role_is_not_assignable(self):
        db = self.SessionLocal()
        try:
            admin = User(
                email="admin@example.com",
                username="admin",
                hashed_password="hashed",
                role="admin",
            )
            target = User(
                email="target@example.com",
                username="target",
                hashed_password="hashed",
                role="admin",
            )
            db.add_all([admin, target])
            db.commit()
            db.refresh(admin)
            db.refresh(target)

            with self.assertRaisesRegex(Exception, "Invalid role"):
                set_user_role(
                    target.id,
                    SetRoleRequest(role="single"),
                    current_user=admin,
                    db=db,
                )
        finally:
            db.close()

    def test_migration_renames_legacy_single_and_batch_roles(self):
        with self.engine.begin() as conn:
            conn.execute(text("DELETE FROM users"))
            conn.execute(text(
                """
                INSERT INTO users (email, username, hashed_password, role)
                VALUES
                    ('single@example.com', 'single_user', 'hashed', 'single'),
                    ('batch@example.com', 'batch_user', 'hashed', 'batch'),
                    ('admin@example.com', 'admin_user', 'hashed', 'admin')
                """
            ))

        migrate_legacy_user_roles(self.engine)

        with self.engine.begin() as conn:
            rows = conn.execute(text(
                "SELECT username, role FROM users ORDER BY username"
            )).fetchall()

        self.assertEqual(
            [(row[0], row[1]) for row in rows],
            [
                ("admin_user", "admin"),
                ("batch_user", "user"),
                ("single_user", "user"),
            ],
        )


if __name__ == "__main__":
    unittest.main()
