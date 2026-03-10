import os
import shutil

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, UploadBatch
from app.schemas import UserCreate, UserResponse, Token
from app.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_admin,
)

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        email=user_in.email,
        username=user_in.username,
        hashed_password=hash_password(user_in.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": token}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# --------------- Admin: User Management ---------------

@router.get("/", response_model=list[UserResponse])
def list_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all users. Admin only."""
    return db.query(User).order_by(User.id).all()


class SetRoleRequest(BaseModel):
    role: str


@router.put("/{user_id}/role", response_model=UserResponse)
def set_user_role(
    user_id: int,
    body: SetRoleRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Set the role for a user. Admin only.

    Valid roles: single, batch, admin.
    Cannot change your own role.
    """
    valid_roles = ("single", "batch", "admin")
    if body.role not in valid_roles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}",
        )

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Cannot change your own role",
        )

    target.role = body.role
    db.commit()
    db.refresh(target)
    return target


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a user and all their data. Admin only.

    Cannot delete yourself.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=400, detail="Cannot delete your own account",
        )

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Delete all batches owned by the user (cascade deletes images and patient info)
    from app.config import UPLOAD_DIR

    batches = db.query(UploadBatch).filter(
        UploadBatch.user_id == user_id
    ).all()
    for batch in batches:
        batch_dir = os.path.join(UPLOAD_DIR, str(user_id), str(batch.id))
        if os.path.exists(batch_dir):
            shutil.rmtree(batch_dir)
        db.delete(batch)

    # Remove the user's upload directory if it still exists
    user_dir = os.path.join(UPLOAD_DIR, str(user_id))
    if os.path.exists(user_dir):
        shutil.rmtree(user_dir)

    db.delete(target)
    db.commit()
