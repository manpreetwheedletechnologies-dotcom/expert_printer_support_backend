"""
seed_admin.py — Run once to create the first admin user in MongoDB.

Usage:
    python seed_admin.py

Make sure your .env is configured and MongoDB is running before executing.
"""

import asyncio
import bcrypt
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
DB_NAME   = os.getenv('DB_NAME', 'techforcall')

# ── Change these before running ───────────────────────────────────────────────
ADMIN_NAME     = 'Admin'
ADMIN_EMAIL    = 'admin@techforcall.ai'
ADMIN_PASSWORD = 'ChangeMe123!'
# ─────────────────────────────────────────────────────────────────────────────


async def seed():
    client = AsyncIOMotorClient(MONGO_URI)
    db     = client[DB_NAME]

    existing = await db['users'].find_one({'email': ADMIN_EMAIL})
    if existing:
        print(f'Admin already exists: {ADMIN_EMAIL}')
        return

    hashed = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()

    result = await db['users'].insert_one({
        'name':       ADMIN_NAME,
        'email':      ADMIN_EMAIL,
        'password':   hashed,
        'role':       'admin',
        'phone':      '',
        'created_at': datetime.utcnow().isoformat(),
    })

    print(f'✅  Admin created! id={result.inserted_id}')
    print(f'    Email:    {ADMIN_EMAIL}')
    print(f'    Password: {ADMIN_PASSWORD}')
    print('    Change the password after first login.')

    # ── Create MongoDB indexes (run once) ────────────────────────────────────
    await db['leads'].create_index([('assigned_to', 1)])
    await db['chats'].create_index([('agent_id', 1), ('status', 1)])
    await db['messages'].create_index([('chat_id', 1), ('created_at', 1)])
    print('✅  MongoDB indexes created.')

    client.close()


if __name__ == '__main__':
    asyncio.run(seed())
