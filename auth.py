# auth.py

from fastapi import APIRouter, Depends, HTTPException, Header
from jose import jwt, JWTError
from bson import ObjectId
from datetime import datetime, timedelta
from database import users_col, fix_id
from models import LoginRequest, LoginResponse
import bcrypt, os

router = APIRouter()

SECRET  = os.getenv('JWT_SECRET', 'change-me')
ALGO    = 'HS256'
EXPIRES = int(os.getenv('JWT_EXPIRE_HOURS', 8))


# ── Token helpers ──────────────────────────────────────────────────────────────

def create_token(user_id: str, role: str) -> str:
    return jwt.encode(
        {
            'sub':  user_id,
            'role': role,
            'exp':  datetime.utcnow() + timedelta(hours=EXPIRES),
        },
        SECRET,
        algorithm=ALGO,
    )

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET, algorithms=[ALGO])
    except JWTError:
        raise HTTPException(401, 'Invalid or expired token')


# ── Dependency: current user from Bearer token ─────────────────────────────────

async def get_current_user(authorization: str = Header(...)):
    token   = authorization.replace('Bearer ', '')
    payload = decode_token(token)
    user    = await users_col.find_one({'_id': ObjectId(payload['sub'])})
    if not user:
        raise HTTPException(401, 'User not found')
    return fix_id(user)


# ── Dependency: require a specific role ───────────────────────────────────────

def require_role(role: str):
    async def check(user=Depends(get_current_user)):
        if user['role'] != role:
            raise HTTPException(403, f'Access denied — {role} only')
        return user
    return check


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post('/login', response_model=LoginResponse)
async def login(data: LoginRequest):
    user = await users_col.find_one({'email': data.email})
    if not user:
        raise HTTPException(401, 'Invalid email or password')
    if not bcrypt.checkpw(data.password.encode(), user['password'].encode()):
        raise HTTPException(401, 'Invalid email or password')

    user     = fix_id(user)
    token    = create_token(user['id'], user['role'])
    name     = user['name']
    initials = ''.join(w[0].upper() for w in name.split()[:2])

    # role in token → React navigates to /dashboard/admin or /dashboard/agent
    return {
        'token': token,
        'user': {
            'id':       user['id'],
            'name':     name,
            'email':    user['email'],
            'role':     user['role'],
            'initials': initials,
        },
    }


@router.post('/logout')
async def logout():
    # JWT is stateless — just return OK (React clears localStorage)
    return {'ok': True}
