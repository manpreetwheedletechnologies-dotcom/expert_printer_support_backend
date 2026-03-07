# models.py

from pydantic import BaseModel
from typing import Optional, List


# ── Auth ───────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str          # 'admin' or 'agent'
    initials: str

class LoginResponse(BaseModel):
    token: str
    user: UserOut


# ── Leads ──────────────────────────────────────────────────────────────────────

class LeadOut(BaseModel):
    id: str
    customer: str
    email: Optional[str]    = None
    phone: Optional[str]    = None
    location: Optional[str] = None
    printer: Optional[str]  = None
    issue: Optional[str]    = None
    status: str             = 'New'
    assigned_to: Optional[str] = None
    created_at: str

class StatusUpdate(BaseModel):
    status: str


# ── Agents ─────────────────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    name: str
    email: str
    password: str
    phone: Optional[str] = None

class AgentUpdate(BaseModel):
    name: Optional[str]  = None
    email: Optional[str] = None
    phone: Optional[str] = None


# ── Chats ──────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    """A single message from the Flask chatbot conversation history."""
    sender: str   # 'bot' or 'customer'
    text: str
    created_at: Optional[str] = None

class NewChatRequest(BaseModel):
    """
    Sent by the React chatbot (PrinterBot) when the customer has confirmed
    their details and wants to connect to a live agent.

    Includes:
      - customer contact details collected by Flask (name/email/phone/location)
      - printer & issue context captured from Phase-1 chat
      - the full conversation history from the Flask chatbot (optional)
        so the agent sees exactly what the customer already told the bot
    """
    customer:  str
    email:     Optional[str] = None
    phone:     Optional[str] = None
    location:  Optional[str] = None
    printer:   str
    issue:     str
    # Full Phase-1 chat history from Flask chatbot — saved as opening messages
    history:   Optional[List[ChatMessage]] = []

class ChatOut(BaseModel):
    id: str
    customer: str
    agent_id: Optional[str] = None
    status: str
    created_at: str

class MessageOut(BaseModel):
    id: str
    chat_id: str
    sender: str
    text: str
    created_at: str
