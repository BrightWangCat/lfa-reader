"""
Migration script: Convert is_admin (Boolean) column to role (String) column.
- Users with is_admin=True become role='admin'
- All other users become role='single'
- The mingshi user is ensured to have role='admin'

Run: python migrate_roles.py
"""
import sqlite3
import os
import sys

DB_PATH = os.path.join(os.path.dirname(__file__), "lfa_reader.db")

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check if migration is needed
    cursor.execute("PRAGMA table_info(users)")
    columns = {row[1]: row[2] for row in cursor.fetchall()}

    if "role" in columns and "is_admin" not in columns:
        print("Migration already completed. Skipping.")
        conn.close()
        return

    if "is_admin" not in columns:
        print("Column is_admin not found. Unexpected schema state.")
        conn.close()
        sys.exit(1)

    print("Starting migration: is_admin -> role")

    # Step 1: Add role column
    if "role" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'single'")
        print("  Added 'role' column with default 'single'")

    # Step 2: Set role based on is_admin value
    cursor.execute("UPDATE users SET role = 'admin' WHERE is_admin = 1")
    admin_count = cursor.rowcount
    cursor.execute("UPDATE users SET role = 'single' WHERE is_admin = 0 OR is_admin IS NULL")
    single_count = cursor.rowcount
    print(f"  Migrated {admin_count} admin(s), {single_count} single user(s)")

    # Step 3: Ensure mingshi is admin
    cursor.execute("UPDATE users SET role = 'admin' WHERE username = 'mingshi'")

    # Step 4: SQLite cannot drop columns in older versions, so we recreate the table
    # Create new table without is_admin
    cursor.execute("""
        CREATE TABLE users_new (
            id INTEGER PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'single',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        INSERT INTO users_new (id, email, username, hashed_password, role, created_at)
        SELECT id, email, username, hashed_password, role, created_at FROM users
    """)
    cursor.execute("DROP TABLE users")
    cursor.execute("ALTER TABLE users_new RENAME TO users")

    # Recreate indexes
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_users_id ON users (id)")

    conn.commit()
    conn.close()
    print("Migration completed successfully.")

    # Verify
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role FROM users")
    rows = cursor.fetchall()
    print("\nCurrent users:")
    for row in rows:
        print(f"  id={row[0]}, username={row[1]}, role={row[2]}")
    conn.close()


if __name__ == "__main__":
    migrate()
