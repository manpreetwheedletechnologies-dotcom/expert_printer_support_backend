# routers/admin.py
#
# Admin endpoints — full visibility over all leads, agents, and chats.
# Admin can also resolve or reassign any chat.

from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime
from database import users_col, leads_col, chats_col, messages_col, fix_id
from models import StatusUpdate, AgentCreate, AgentUpdate
from auth import require_role, get_current_user
import bcrypt

router     = APIRouter()
admin_only = Depends(require_role('admin'))


# ══════════════════════════════════════════════════════════════════════════════
# STATS
# ══════════════════════════════════════════════════════════════════════════════

@router.get('/stats')
async def get_stats(_ = admin_only):
    total_leads   = await leads_col.count_documents({})
    active_chats  = await chats_col.count_documents({'status': 'active'})
    waiting_chats = await chats_col.count_documents({'status': 'waiting'})
    resolved      = await leads_col.count_documents({'status': 'Resolved'})
    agents        = await users_col.count_documents({'role': 'agent'})

    return [
        {
            'label':    'Total Leads',
            'value':    str(total_leads),
            'change':   '+12% vs last week',
            'positive': True,
            'icon':     'list',
            'accent':   'bg-blue-50 text-blue-500',
        },
        {
            'label':    'Active Chats',
            'value':    str(active_chats),
            'change':   f'{waiting_chats} waiting',
            'positive': False,
            'icon':     'chat',
            'accent':   'bg-orange-50 text-orange-500',
        },
        {
            'label':    'Resolved Issues',
            'value':    str(resolved),
            'change':   '+18% vs last week',
            'positive': True,
            'icon':     'checkCircle',
            'accent':   'bg-emerald-50 text-emerald-500',
        },
        {
            'label':    'Total Agents',
            'value':    str(agents),
            'change':   '+2 this month',
            'positive': True,
            'icon':     'users',
            'accent':   'bg-purple-50 text-purple-500',
        },
    ]


# ══════════════════════════════════════════════════════════════════════════════
# LEADS
# ══════════════════════════════════════════════════════════════════════════════

@router.get('/leads')
async def get_all_leads(_ = admin_only):
    cursor = leads_col.find().sort('created_at', -1)
    leads  = [fix_id(l) async for l in cursor]
    return {'leads': leads}


@router.patch('/leads/{lead_id}/status')
async def update_status(lead_id: str, body: StatusUpdate, _ = admin_only):
    await leads_col.update_one(
        {'_id': ObjectId(lead_id)},
        {'$set': {'status': body.status}},
    )
    return {'ok': True}


@router.patch('/leads/{lead_id}/assign')
async def assign_lead(lead_id: str, body: dict, _ = admin_only):
    """Assign a lead to a specific agent."""
    agent_id = body.get('agent_id')
    await leads_col.update_one(
        {'_id': ObjectId(lead_id)},
        {'$set': {'assigned_to': agent_id, 'status': 'In Progress'}},
    )
    return {'ok': True}


@router.delete('/leads/{lead_id}')
async def delete_lead(lead_id: str, _ = admin_only):
    await leads_col.delete_one({'_id': ObjectId(lead_id)})
    return {'ok': True}


# ══════════════════════════════════════════════════════════════════════════════
# AGENTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get('/agents')
async def get_agents(_ = admin_only):
    cursor = users_col.find({'role': 'agent'}).sort('created_at', -1)
    agents = []
    for a in [fix_id(a) async for a in cursor]:
        a.pop('password', None)   # never expose hashed password
        agents.append(a)
    return {'agents': agents}


@router.post('/agents')
async def add_agent(data: AgentCreate, _ = admin_only):
    existing = await users_col.find_one({'email': data.email})
    if existing:
        raise HTTPException(400, 'Email already exists')

    hashed = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
    result = await users_col.insert_one({
        'name':       data.name,
        'email':      data.email,
        'password':   hashed,
        'role':       'agent',
        'phone':      data.phone,
        'created_at': datetime.utcnow().isoformat(),
    })
    return {'id': str(result.inserted_id)}


@router.put('/agents/{agent_id}')
async def update_agent(agent_id: str, data: AgentUpdate, _ = admin_only):
    update = {k: v for k, v in data.dict().items() if v is not None}
    if not update:
        raise HTTPException(400, 'Nothing to update')
    await users_col.update_one({'_id': ObjectId(agent_id)}, {'$set': update})
    return {'ok': True}


@router.delete('/agents/{agent_id}')
async def delete_agent(agent_id: str, _ = admin_only):
    await users_col.delete_one({'_id': ObjectId(agent_id)})
    return {'ok': True}


# ══════════════════════════════════════════════════════════════════════════════
# CHATS — Admin sees ALL chats with full details
# ══════════════════════════════════════════════════════════════════════════════

@router.get('/chats')
async def get_all_chats(_ = admin_only):
    cursor = chats_col.find().sort('created_at', -1)
    chats  = [fix_id(c) async for c in cursor]
    return {'chats': chats}


@router.get('/chats/{chat_id}/messages')
async def get_chat_messages(chat_id: str, _ = admin_only):
    """Full message history for a chat (for admin oversight view)."""
    cursor = messages_col.find({'chat_id': chat_id}).sort('created_at', 1)
    msgs   = [fix_id(m) async for m in cursor]
    return {'messages': msgs}


@router.post('/chats/{chat_id}/resolve')
async def admin_resolve_chat(chat_id: str, _ = admin_only):
    """Admin can force-resolve any chat."""
    from routers.chat import manager as ws_manager

    chat_doc = await chats_col.find_one({'_id': ObjectId(chat_id)})
    if not chat_doc:
        raise HTTPException(404, 'Chat not found')

    now = datetime.utcnow().isoformat()

    await chats_col.update_one(
        {'_id': ObjectId(chat_id)},
        {'$set': {'status': 'resolved', 'resolved_at': now}},
    )

    lead_id = chat_doc.get('lead_id')
    if lead_id:
        await leads_col.update_one(
            {'_id': ObjectId(lead_id)},
            {'$set': {'status': 'Resolved', 'resolved_at': now}},
        )

    room = f'chat_{chat_id}'
    await ws_manager.broadcast(room, {
        'event':       'chat_resolved',
        'chat_id':     chat_id,
        'resolved_at': now,
    })

    return {'ok': True}


@router.patch('/chats/{chat_id}/assign')
async def admin_assign_chat(chat_id: str, body: dict, _ = admin_only):
    """Admin reassigns a chat to a different agent."""
    agent_id = body.get('agent_id')
    await chats_col.update_one(
        {'_id': ObjectId(chat_id)},
        {'$set': {'agent_id': agent_id, 'status': 'active'}},
    )
    return {'ok': True}
