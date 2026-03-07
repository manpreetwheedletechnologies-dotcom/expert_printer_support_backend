# routers/agent.py
#
# ════════════════════════════════════════════════════════════════════════════
#  Agent endpoints — everything scoped to the logged-in agent
#
#  Key flows:
#
#  GET  /api/agent/chats
#    Returns chats that are either "waiting" (unassigned) OR assigned to
#    this agent (active/resolved). This way every agent sees the pool of
#    waiting chats to pick from.
#
#  POST /api/agent/chats/{id}/accept
#    - Sets chat status = "active", agent_id = this agent
#    - Assigns the linked lead to this agent
#    - Broadcasts "chat_accepted" to the WS room so the customer UI
#      immediately shows the agent has joined
#
#  POST /api/agent/chats/{id}/resolve
#    - Sets chat status = "resolved"
#    - Sets linked lead status = "Resolved"
#    - Broadcasts "chat_resolved" to the WS room
# ════════════════════════════════════════════════════════════════════════════

from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from database import leads_col, chats_col, fix_id
from models import StatusUpdate
from auth import require_role, get_current_user

router     = APIRouter()
agent_only = Depends(require_role('agent'))


# ── Import the shared WS manager from chat router ────────────────────────────
# We need it to broadcast chat_accepted / chat_resolved events.
from routers.chat import manager


# ══════════════════════════════════════════════════════════════════════════════
# STATS
# ══════════════════════════════════════════════════════════════════════════════

@router.get('/stats')
async def get_agent_stats(user=Depends(get_current_user), _=agent_only):
    my_leads      = await leads_col.count_documents({'assigned_to': user['id']})
    active_chats  = await chats_col.count_documents({'agent_id': user['id'], 'status': 'active'})
    resolved      = await leads_col.count_documents({'assigned_to': user['id'], 'status': 'Resolved'})
    waiting_count = await chats_col.count_documents({'status': 'waiting'})

    return [
        {
            'label':    'My Leads',
            'value':    str(my_leads),
            'change':   '+5 today',
            'positive': True,
            'icon':     'list',
            'accent':   'bg-blue-50 text-blue-500',
        },
        {
            'label':    'Active Chats',
            'value':    str(active_chats),
            'change':   '2 pending reply',
            'positive': False,
            'icon':     'chat',
            'accent':   'bg-orange-50 text-orange-500',
        },
        {
            'label':    'Resolved Today',
            'value':    str(resolved),
            'change':   '+3 vs yesterday',
            'positive': True,
            'icon':     'checkCircle',
            'accent':   'bg-emerald-50 text-emerald-500',
        },
        {
            'label':    'Waiting Chats',
            'value':    str(waiting_count),
            'change':   'Unassigned requests',
            'positive': waiting_count == 0,
            'icon':     'clock',
            'accent':   'bg-amber-50 text-amber-500',
        },
    ]


# ══════════════════════════════════════════════════════════════════════════════
# LEADS (assigned to this agent only)
# ══════════════════════════════════════════════════════════════════════════════

@router.get('/leads')
async def get_my_leads(user=Depends(get_current_user), _=agent_only):
    cursor = leads_col.find({'assigned_to': user['id']}).sort('created_at', -1)
    leads  = [fix_id(l) async for l in cursor]
    return {'leads': leads}


@router.patch('/leads/{lead_id}/status')
async def update_lead_status(lead_id: str, body: StatusUpdate, _=agent_only):
    await leads_col.update_one(
        {'_id': ObjectId(lead_id)},
        {'$set': {'status': body.status}},
    )
    return {'ok': True}


# ══════════════════════════════════════════════════════════════════════════════
# CHATS
# ══════════════════════════════════════════════════════════════════════════════

@router.get('/chats')
async def get_agent_chats(user=Depends(get_current_user), _=agent_only):
    """
    Returns:
      - All WAITING chats (unassigned, any agent can accept)
      - All chats assigned to THIS agent (active or resolved)
    Merged and sorted newest first so the agent sees the full picture.
    """
    # Waiting chats — available for any agent to pick up
    cursor_waiting = chats_col.find({'status': 'waiting'}).sort('created_at', -1)
    waiting        = [fix_id(c) async for c in cursor_waiting]

    # This agent's own chats (active + resolved)
    cursor_mine = chats_col.find({'agent_id': user['id']}).sort('created_at', -1)
    mine        = [fix_id(c) async for c in cursor_mine]

    # Merge, deduplicate by id
    seen   = set()
    merged = []
    for chat in waiting + mine:
        if chat['id'] not in seen:
            seen.add(chat['id'])
            merged.append(chat)

    # Sort: waiting first, then active, then resolved
    status_order = {'waiting': 0, 'active': 1, 'resolved': 2}
    merged.sort(key=lambda c: status_order.get(c.get('status', 'resolved'), 3))

    return {'chats': merged}


@router.post('/chats/{chat_id}/accept')
async def accept_chat(chat_id: str, user=Depends(get_current_user), _=agent_only):
    """
    Agent accepts a waiting chat.
    - Sets chat status = "active", assigns agent_id
    - Assigns the linked lead to this agent
    - Broadcasts chat_accepted to the WS room so:
        * The customer's PrinterBot UI knows a real agent joined
        * The agent's dashboard updates the chat status
    """
    # Verify chat exists and is still waiting
    chat_doc = await chats_col.find_one({'_id': ObjectId(chat_id)})
    if not chat_doc:
        raise HTTPException(404, 'Chat not found')
    if chat_doc.get('status') not in ('waiting', 'active'):
        raise HTTPException(400, f'Chat is already {chat_doc.get("status")}')

    agent_id   = user['id']
    agent_name = user.get('name', 'Agent')

    # Update chat
    await chats_col.update_one(
        {'_id': ObjectId(chat_id)},
        {'$set': {
            'status':       'active',
            'agent_id':     agent_id,
            'agent_name':   agent_name,
            'accepted_at':  datetime.utcnow().isoformat(),
        }},
    )

    # Assign the linked lead to this agent so it appears in their leads list
    lead_id = chat_doc.get('lead_id')
    if lead_id:
        await leads_col.update_one(
            {'_id': ObjectId(lead_id)},
            {'$set': {
                'assigned_to': agent_id,
                'status':      'In Progress',
            }},
        )

    # Broadcast to the chat room — customer sees "agent joined"
    room = f'chat_{chat_id}'
    await manager.broadcast(room, {
        'event':      'chat_accepted',
        'chat_id':    chat_id,
        'agent_id':   agent_id,
        'agent_name': agent_name,
    })

    return {
        'ok':         True,
        'chat_id':    chat_id,
        'agent_id':   agent_id,
        'agent_name': agent_name,
    }


@router.post('/chats/{chat_id}/resolve')
async def resolve_chat(chat_id: str, user=Depends(get_current_user), _=agent_only):
    """
    Agent marks the chat as resolved.
    - Sets chat status = "resolved"
    - Sets linked lead status = "Resolved"
    - Broadcasts chat_resolved to the WS room
    """
    chat_doc = await chats_col.find_one({'_id': ObjectId(chat_id)})
    if not chat_doc:
        raise HTTPException(404, 'Chat not found')

    now = datetime.utcnow().isoformat()

    # Update chat
    await chats_col.update_one(
        {'_id': ObjectId(chat_id)},
        {'$set': {'status': 'resolved', 'resolved_at': now}},
    )

    # Update linked lead
    lead_id = chat_doc.get('lead_id')
    if lead_id:
        await leads_col.update_one(
            {'_id': ObjectId(lead_id)},
            {'$set': {'status': 'Resolved', 'resolved_at': now}},
        )

    # Broadcast to the chat room — customer sees the chat is closed
    room = f'chat_{chat_id}'
    await manager.broadcast(room, {
        'event':    'chat_resolved',
        'chat_id':  chat_id,
        'resolved_at': now,
    })

    return {'ok': True, 'chat_id': chat_id}


# ── Import datetime (needed for accept/resolve) ───────────────────────────────
from datetime import datetime
