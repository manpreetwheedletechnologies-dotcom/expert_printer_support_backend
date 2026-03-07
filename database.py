# database.py

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
DB_NAME   = os.getenv('DB_NAME', 'techforcall')

# Single global client (Motor is async-safe)
client = AsyncIOMotorClient(MONGO_URI)
db     = client[DB_NAME]

# Collection references — use these in all routers
users_col    = db['users']      # admins & agents
leads_col    = db['leads']      # support tickets
chats_col    = db['chats']      # live chat sessions
messages_col = db['messages']   # chat messages


# Helper: convert MongoDB _id to string for JSON
def fix_id(doc: dict) -> dict:
    if doc and '_id' in doc:
        doc['id'] = str(doc.pop('_id'))
    return doc
