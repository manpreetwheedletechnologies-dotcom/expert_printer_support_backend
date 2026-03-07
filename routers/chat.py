# routers/chat.py
#
# ════════════════════════════════════════════════════════════════════════════
#  UNIFIED PRINTER SUPPORT ROUTER
#  Mounted in main.py as:  prefix='/api/chats'
#
#  Phase 1 & 2 — PrinterBot Chatbot
#    POST /api/chats/chat          → keyword/AI responses, contact collection
#    POST /api/chats/reset-session → clear session
#
#  Phase 3+ — Live Agent Chat
#    POST /api/chats/new                    → create lead + chat in MongoDB
#    WS   /api/chats/ws/{chat_id}           → live chat room (customer ↔ agent)
#    WS   /api/chats/ws/notify              → agent notification channel
#    POST /api/chats/agent/{id}/accept      → agent accepts a waiting chat
#    POST /api/chats/agent/{id}/resolve     → agent resolves a chat
#    GET  /api/chats/{chat_id}/messages     → fetch message history
#    GET  /api/chats/{chat_id}              → fetch chat document
# ════════════════════════════════════════════════════════════════════════════

import os
import re
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from bson import ObjectId
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# ── Import MongoDB collections from your database module ─────────────────────
from database import chats_col, leads_col, messages_col, fix_id

router = APIRouter()

# ══════════════════════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════════════════════

API_KEY_SECRET      = os.getenv("API_KEY_SECRET", "")
SESSION_TIMEOUT_MIN = 30
openai_client       = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))


# ══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ══════════════════════════════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    message: str

class HistoryMessage(BaseModel):
    sender: str
    text: str
    created_at: Optional[str] = None

class NewChatRequest(BaseModel):
    customer: str
    email: str
    phone: str
    location: Optional[str] = ""
    printer:  Optional[str] = ""
    issue:    Optional[str] = ""
    history:  Optional[List[HistoryMessage]] = []


# ══════════════════════════════════════════════════════════════════════════════
# CHATBOT DATA
# ══════════════════════════════════════════════════════════════════════════════

greetings = {
    "hello":          "Hello! I'm your smart printer assistant. Tell me your issue and I'll guide you.",
    "hi":             "Hi there! Need help with your printer? Our experts provide live guidance.",
    "hey":            "Hey! I'm here to help you with your printer. What's up?",
    "good morning":   "Good morning! Ready to make your printer work perfectly today?",
    "good afternoon": "Good afternoon! How can I assist you with your printer?",
    "good evening":   "Good evening! Need printer help tonight?",
    "yo":             "Yo! Need a hand with your printer?",
    "bye":            "Goodbye! Keep your printer healthy.",
    "goodbye":        "Goodbye! Don't forget to check your printer regularly.",
    "see you":        "See you! Happy printing!",
    "take care":      "Take care! Keep your printer happy.",
    "thank you":      "You're welcome! Always here to help.",
    "thanks":         "No problem! Glad I could help.",
    "thx":            "Anytime! Let me know if you need more help.",
}

brand_links = {
    "hp":             "https://support.hp.com/printer",
    "brother":        "https://support.brother.com",
    "canon":          "https://www.canon.com/support",
    "epson":          "https://www.epson.com/support",
    "xerox":          "https://www.support.xerox.com",
    "ricoh":          "https://support.ricoh.com",
    "kyocera":        "https://www.kyoceradocumentsolutions.com/support",
    "samsung":        "https://support.hp.com/samsung",
    "panasonic":      "https://www.panasonic.com/support",
    "fujitsu":        "https://www.fujitsu.com/global/support",
    "konica minolta": "https://www.konicaminolta.com/support",
    "tally":          "https://www.tallygenicom.com/support",
}

issues = {
    # ── Print Quality ─────────────────────────────────────────────────────────
    "faded or light prints":              "Check ink/toner levels, run printhead cleaning, and adjust print density.",
    "streaks or lines on paper":          "Clean the printhead, align your printer, and ensure rollers are clean.",
    "smudged ink or toner":               "Use recommended paper, let prints dry, and check the fuser on laser printers.",
    "blurry text or images":              "Check print quality settings, verify DPI, and clean the printhead.",
    "wrong colors":                       "Check ink levels, run printer calibration, and update your driver.",
    "blank pages printing":               "Remove cartridge protective strip, check ink levels, and clean the printhead.",
    "double printing (ghosting)":         "Check the fuser, reduce humidity, or replace the drum unit.",
    "uneven or patchy printing":          "Clean nozzles, replace low cartridges, and use recommended paper.",
    "spots or toner specks":              "Clean inside the printer; consider replacing drum or toner.",
    # ── Paper Handling ────────────────────────────────────────────────────────
    "paper jam":                          "Turn off printer, gently remove stuck paper, then restart.",
    "frequent paper jams":                "Use correct paper type/size, clean rollers, don't overload the tray.",
    "printer not picking paper":          "Adjust paper guides and clean the pickup rollers.",
    "multiple sheets feeding":            "Fan paper before loading and reduce stack height.",
    "paper stuck in tray":                "Remove the tray, check for stuck pages, and reload properly.",
    "wrinkled or curled paper":           "Store paper in a dry place and use the recommended type.",
    "wrong paper size error":             "Ensure paper settings in printer match what's loaded.",
    # ── Connectivity ──────────────────────────────────────────────────────────
    "printer offline windows 11":         "Go to Settings > Bluetooth & devices > Printers, remove and re-add the printer.",
    "printer offline windows 10":         "Open Devices and Printers, right-click printer, uncheck 'Use Printer Offline'.",
    "why is my printer offline":          "Restart printer and router, then check if it's set as the default printer.",
    "printer not printing after wifi change": "Re-add printer using its new IP, or run the wireless setup wizard.",
    "reconnect printer to new router":    "Use the printer control panel wireless setup wizard to enter new Wi-Fi credentials.",
    "printer not found on network":       "Ensure same Wi-Fi, check firewall, add printer manually via IP.",
    "printer offline":                    "Set as default printer, restart print spooler, and check connections.",
    "not connecting to wifi":             "Restart printer and router, check Wi-Fi password, move printer closer to router.",
    # ── Setup & Installation ──────────────────────────────────────────────────
    "set up new printer on laptop":       "Go to Settings > Devices > Add a printer or scanner.",
    "install printer drivers windows":    "Download latest driver from manufacturer's site, run installer, restart.",
    "wireless printer setup assistance":  "Press Wi-Fi button, connect via setup wizard, then add from computer settings.",
    "connect printer to laptop wifi":     "Use printer's Network Settings > Wireless Setup Wizard, then add from laptop.",
    "printer software installation help": "Visit your printer brand's support website, download the full software package, and follow the installer.",
    # ── Error-Specific ────────────────────────────────────────────────────────
    "printer driver is unavailable":      "Uninstall current driver from Device Manager and reinstall from manufacturer.",
    "fix printer spooler error":          "Open services.msc, restart 'Print Spooler', clear the spool PRINTERS folder.",
    "printer not printing from windows":  "Check print queue, restart Print Spooler, set printer as default.",
    "printer communication error help":   "Check connection, reinstall driver, ensure no firewall is blocking printer.",
    # ── Software & Driver ─────────────────────────────────────────────────────
    "driver not installed":               "Download latest driver from manufacturer's website and install.",
    "outdated or corrupt driver":         "Uninstall and reinstall the newest driver version.",
    "print spooler error":                "Restart the Print Spooler service from Windows Services.",
    "not responding to print command":    "Clear print queue and restart printer and computer.",
    "error messages on computer":         "Note the error code, update driver, and restart system.",
    "firmware update failure":            "Ensure stable internet, retry update, or reset the printer.",
    # ── Hardware ──────────────────────────────────────────────────────────────
    "printer not turning on":             "Check power cable, try a different outlet, ensure printer is switched on.",
    "strange noises":                     "Check inside for paper pieces and inspect the rollers.",
    "overheating":                        "Turn off printer for a while and ensure proper ventilation.",
    "cartridge not recognized":           "Remove and reinstall cartridge; clean the cartridge contacts.",
    "low ink warning after refill":       "Reset ink levels or replace the chip if your cartridge has one.",
    "broken rollers":                     "Rollers need replacing to feed paper properly.",
    "faulty printhead":                   "Try cleaning; replace if damaged.",
    # ── Performance ───────────────────────────────────────────────────────────
    "slow printing speed":                "Lower print quality for speed and ensure driver is updated.",
    "printer freezing":                   "Restart printer and check for firmware updates.",
    "queue stuck":                        "Cancel all jobs and restart the print spooler.",
    "memory full error":                  "Print smaller files or add memory if your printer supports it.",
    "printer resets randomly":            "Check power supply and update firmware.",
    "alignment issues":                   "Run the printer alignment tool.",
    "scanner not working":                "Update scanner driver, check connections, restart the scanning service.",
    # ── General ───────────────────────────────────────────────────────────────
    "low ink":                            "Ink is running low. Check the cartridge and replace if needed.",
    "not connecting":                     "Restart printer and computer, check Wi-Fi or cable connections.",
    "usb not detected":                   "Try a different USB port, swap the cable, or reinstall printer driver.",
    "network printer not found":          "Ensure same network and add printer manually via IP if needed.",
    "slow network printing":              "Check network speed, reduce file size, and update firmware.",
    "bluetooth not working":              "Re-pair device and ensure Bluetooth is enabled on both ends.",
}

NEGATIVE_KEYWORDS = [
    "free", "refund", "warranty", "hp official", "epson official",
    "canon official", "ink cartridge", "repair shop near me", "returns",
]

EXPLICIT_BLOCKED_WORDS = [
    "sex", "porn", "nude", "naked", "adult", "xxx", "sexual", "nsfw",
    "erotic", "obscene", "vulgar", "rape", "molest", "prostitut",
    "escort", "fetish", "masturbat", "orgasm", "genitals", "penis", "vagina",
]

PRINTER_KEYWORDS = [
    "printer", "print", "printing", "printout", "printed",
    "scanner", "scan", "scanning", "copier", "copy", "fax",
    "cartridge", "toner", "ink", "inkjet", "laser",
    "printhead", "print head", "nozzle", "drum",
    "paper", "tray", "feeder", "roller", "spooler", "spool",
    "driver", "firmware", "setup", "install", "installation",
    "wifi", "wireless", "network", "offline", "online",
    "usb", "bluetooth", "cable", "connection", "connect",
    "hp", "canon", "epson", "brother", "xerox", "ricoh",
    "kyocera", "samsung", "panasonic", "fujitsu", "konica", "minolta", "tally",
    "queue", "job", "document", "page", "dpi", "resolution",
    "smudge", "streak", "faded", "blurry", "blank",
    "jam", "stuck", "feed", "misfeed",
    "port", "ip address", "router",
    "error", "not working", "not printing", "not connecting",
    "slow", "freeze", "restart", "reboot", "reset",
    "color", "colour", "black", "white", "grayscale",
    "alignment", "calibrate", "calibration", "test page",
    "overheating", "noise", "beep", "indicator",
]


# ══════════════════════════════════════════════════════════════════════════════
# IN-MEMORY SESSION STORE
# ══════════════════════════════════════════════════════════════════════════════

user_sessions: Dict[str, dict] = {}


def get_or_create_session(user_id: str) -> dict:
    _clean_expired_sessions()
    if user_id not in user_sessions:
        user_sessions[user_id] = {
            "mode":            "normal",
            "contact":         {},
            "ai_answer_count": 0,
            "support_started": False,
            "last_active":     datetime.utcnow(),
        }
    session = user_sessions[user_id]
    session["last_active"] = datetime.utcnow()
    return session


def _clean_expired_sessions():
    now     = datetime.utcnow()
    expired = [
        uid for uid, s in user_sessions.items()
        if now - s["last_active"] > timedelta(minutes=SESSION_TIMEOUT_MIN)
    ]
    for uid in expired:
        del user_sessions[uid]


# ══════════════════════════════════════════════════════════════════════════════
# CHATBOT HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _contains_explicit(text: str) -> bool:
    return any(w in text for w in EXPLICIT_BLOCKED_WORDS)

def _is_negative_keyword(text: str) -> bool:
    return any(kw in text for kw in NEGATIVE_KEYWORDS)

def _is_printer_related(text: str) -> bool:
    return any(kw in text for kw in PRINTER_KEYWORDS)

def _save_lead_to_file(contact: dict):
    """Persist Phase-1 lead contact to leads.json."""
    lead = {
        "name":      contact.get("name"),
        "email":     contact.get("email"),
        "phone":     contact.get("phone"),
        "location":  contact.get("location", ""),
        "timestamp": datetime.utcnow().isoformat(),
    }
    file_path = "leads.json"
    try:
        data = json.load(open(file_path)) if os.path.exists(file_path) else []
        data.append(lead)
        with open(file_path, "w") as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        print("Lead Save Error:", e)

def _ai_response(user_input: str) -> str:
    system_message = (
        "You are a certified printer support specialist. "
        "Respond ONLY to printer-related questions. "
        "Reply in 10 to 20 words maximum. "
        "Be professional, confident, and solution-focused. "
        "NEVER respond to sexual, explicit, offensive, or unrelated topics. "
        "If unrelated, say: 'Sorry, I only handle printer-related issues.'"
    )
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user",   "content": user_input},
            ],
            temperature=0.3,
            max_tokens=60,
        )
        reply = response.choices[0].message.content.strip()
        return reply if 10 <= len(reply.split()) <= 20 else \
            "Restart printer and check connections. If issue continues, contact support."
    except Exception as e:
        print("AI Error:", e)
        return "AI service unavailable. Please try again later."


# ══════════════════════════════════════════════════════════════════════════════
# CONNECTION MANAGER  (WebSocket rooms)
# ══════════════════════════════════════════════════════════════════════════════

class ConnectionManager:

    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}
        self.users: Dict[str, WebSocket]        = {}

    async def connect(self, ws: WebSocket, room: str, user_id: str):
        await ws.accept()
        self.rooms.setdefault(room, []).append(ws)
        self.users[user_id] = ws
        print(f"[WS] {user_id} joined room: {room}")

    def disconnect(self, ws: WebSocket, room: str, user_id: str):
        sockets = self.rooms.get(room, [])
        if ws in sockets:
            sockets.remove(ws)
        self.users.pop(user_id, None)
        print(f"[WS] {user_id} left room: {room}")

    async def broadcast(self, room: str, data: dict):
        dead = []
        for ws in list(self.rooms.get(room, [])):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            sockets = self.rooms.get(room, [])
            if ws in sockets:
                sockets.remove(ws)

    async def notify_all_agents(self, data: dict):
        dead = []
        for ws in list(self.rooms.get("notify_agents", [])):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            sockets = self.rooms.get("notify_agents", [])
            if ws in sockets:
                sockets.remove(ws)

    def agent_count(self) -> int:
        return len(self.rooms.get("notify_agents", []))


manager = ConnectionManager()


# ══════════════════════════════════════════════════════════════════════════════
# ── PHASE 1 & 2: CHATBOT ROUTES ──────────────────────────────────────────────
# Mounted at prefix='/api/chats' → full URLs:
#   POST http://localhost:8000/api/chats/chat
#   POST http://localhost:8000/api/chats/reset-session
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/chat")   # → POST /api/chats/chat
async def chat(
    body:      ChatRequest,
    request:   Request,
    x_api_key: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None),
):
    # ── API key guard ──────────────────────────────────────────────────────
    if API_KEY_SECRET and x_api_key != API_KEY_SECRET:
        return JSONResponse({"reply": "Unauthorized", "success": False}, status_code=401)

    raw_input  = body.message.strip()
    user_input = raw_input.lower()

    if not user_input:
        return JSONResponse({"reply": "Please enter a message.", "success": False})

    user_id = x_user_id or request.client.host
    session = get_or_create_session(user_id)

    # ── Already connected to live agent ───────────────────────────────────
    if session["support_started"]:
        return JSONResponse({
            "reply":     "🟢 Certified printer technician connected. Please wait while they review your case.",
            "success":   True,
            "connected": True,
        })

    # ── Contact collection: name → email → phone → location ───────────────
    if session["mode"] == "collect_name":
        session["contact"]["name"] = raw_input
        session["mode"] = "collect_email"
        return JSONResponse({"reply": "Please provide your email address.", "success": True})

    if session["mode"] == "collect_email":
        if not re.match(r"[^@]+@[^@]+\.[^@]+", raw_input):
            return JSONResponse({"reply": "Please enter a valid email address.", "success": False})
        session["contact"]["email"] = raw_input
        session["mode"] = "collect_phone"
        return JSONResponse({"reply": "Please provide your phone number.", "success": True})

    if session["mode"] == "collect_phone":
        digits = re.sub(r"\D", "", raw_input)
        if not (7 <= len(digits) <= 15):
            return JSONResponse({"reply": "Please enter a valid phone number (7-15 digits).", "success": False})
        session["contact"]["phone"] = raw_input
        session["mode"] = "collect_location"
        return JSONResponse({"reply": "Please provide your city or country.", "success": True})

    if session["mode"] == "collect_location":
        if len(raw_input.strip()) < 2:
            return JSONResponse({"reply": "Please enter a valid city or country name.", "success": False})
        session["contact"]["location"] = raw_input
        _save_lead_to_file(session["contact"])
        session["mode"]            = "support_processing"
        session["support_started"] = True
        return JSONResponse({
            "reply":     "🟢 Thank you. A certified printer technician is now reviewing your request.",
            "success":   True,
            "connected": True,
        })

    # ── Explicit content block ─────────────────────────────────────────────
    if _contains_explicit(user_input):
        return JSONResponse({
            "reply":       "I'm sorry, I can only assist with printer-related questions.",
            "success":     True,
            "not_printer": True,
        })

    # ── Greetings ──────────────────────────────────────────────────────────
    for key, reply in greetings.items():
        if key in user_input.split():
            return JSONResponse({"reply": reply, "success": True})

    # ── Negative keywords ──────────────────────────────────────────────────
    if _is_negative_keyword(user_input):
        return JSONResponse({
            "reply":   "Sorry, I can only assist with printer setup, connectivity, and technical issues.",
            "success": True,
        })

    # ── Printer relevance check ────────────────────────────────────────────
    if not _is_printer_related(user_input):
        return JSONResponse({
            "reply":       "This doesn't seem related to a printer issue. Please ask a printer-related question.",
            "success":     True,
            "not_printer": True,
        })

    # ── Brand + issue match ────────────────────────────────────────────────
    for brand, link in brand_links.items():
        if brand in user_input:
            for issue, solution in issues.items():
                if issue in user_input:
                    return JSONResponse({
                        "reply":   f"{solution} Visit {brand.upper()} Support: {link}",
                        "success": True,
                    })
            return JSONResponse({
                "reply":   f"Visit {brand.upper()} Support: {link}. Describe your issue.",
                "success": True,
            })

    # ── Keyword issue match ────────────────────────────────────────────────
    for issue, solution in issues.items():
        if issue in user_input:
            return JSONResponse({"reply": solution, "success": True})

    # ── AI fallback + escalation after 2 unanswered queries ───────────────
    reply_text = _ai_response(raw_input)
    session["ai_answer_count"] += 1

    if session["ai_answer_count"] >= 2:
        session["mode"] = "collect_name"
        return JSONResponse({
            "reply":   "This issue requires advanced assistance. Please provide your full name.",
            "success": True,
        })

    return JSONResponse({"reply": reply_text, "success": True})


@router.post("/reset-session")   # → POST /api/chats/reset-session
async def reset_session(
    request:   Request,
    x_user_id: Optional[str] = Header(default=None),
):
    user_id = x_user_id or request.client.host
    user_sessions.pop(user_id, None)
    return {"success": True, "message": "Session reset."}


# ══════════════════════════════════════════════════════════════════════════════
# ── PHASE 3+: LIVE AGENT CHAT ROUTES ─────────────────────────────────────────
# Mounted at prefix='/api/chats' → full URLs:
#   POST /api/chats/new
#   WS   /api/chats/ws/{chat_id}
#   WS   /api/chats/ws/notify
#   POST /api/chats/agent/{id}/accept
#   POST /api/chats/agent/{id}/resolve
#   GET  /api/chats/{id}/messages
#   GET  /api/chats/{id}
# ══════════════════════════════════════════════════════════════════════════════

@router.websocket("/ws/{chat_id}")
async def chat_room(ws: WebSocket, chat_id: str, user_id: str, role: str):
    room = f"chat_{chat_id}"
    await manager.connect(ws, room, user_id)

    # Send full message history to whoever just joined
    cursor  = messages_col.find({"chat_id": chat_id}).sort("created_at", 1)
    history = [fix_id(m) async for m in cursor]
    await ws.send_json({"event": "history", "messages": history})

    # If an agent joins an active chat, re-send chat_accepted so customer UI updates
    if role == "agent":
        chat_doc = await chats_col.find_one({"_id": ObjectId(chat_id)})
        if chat_doc and chat_doc.get("status") == "active":
            await ws.send_json({
                "event":    "chat_accepted",
                "chat_id":  chat_id,
                "agent_id": user_id,
            })

    try:
        while True:
            raw   = await ws.receive_text()
            data  = json.loads(raw)
            event = data.get("event")

            # ── New chat message ───────────────────────────────────────────
            if event == "message":
                now = datetime.utcnow().isoformat()
                msg = {
                    "chat_id":    chat_id,
                    "sender":     role,
                    "text":       data["text"],
                    "created_at": now,
                }
                result = await messages_col.insert_one(msg)
                msg_id = str(result.inserted_id)

                await manager.broadcast(room, {
                    "event":       "message",
                    "id":          msg_id,
                    "sender":      role,
                    "sender_name": data.get("sender_name", ""),
                    "text":        data["text"],
                    "chat_id":     chat_id,
                    "created_at":  now,
                })

            # ── Agent transfers chat back to pool ──────────────────────────
            elif event == "transfer_to_admin":
                await chats_col.update_one(
                    {"_id": ObjectId(chat_id)},
                    {"$set": {"status": "waiting", "agent_id": None}},
                )
                chat_doc = await chats_col.find_one({"_id": ObjectId(chat_id)})
                await manager.notify_all_agents({
                    "event":      "transfer_request",
                    "chat_id":    chat_id,
                    "customer":   data.get("customer", chat_doc.get("customer", "") if chat_doc else ""),
                    "from_agent": user_id,
                    "chat": {
                        "id":       chat_id,
                        "customer": chat_doc.get("customer", "") if chat_doc else "",
                        "status":   "waiting",
                    },
                })
                await manager.broadcast(room, {"event": "chat_transferred", "chat_id": chat_id})

    except WebSocketDisconnect:
        manager.disconnect(ws, room, user_id)
        print(f"[WS] {user_id} ({role}) disconnected from room: {room}")


@router.websocket("/ws/notify")
async def notify_channel(ws: WebSocket, user_id: str, role: str):
    await manager.connect(ws, "notify_agents", user_id)

    waiting_count = await chats_col.count_documents({"status": "waiting"})
    cursor        = chats_col.find({"status": "waiting"}).sort("created_at", -1)
    waiting_chats = [fix_id(c) async for c in cursor]
    await ws.send_json({
        "event": "pending_chats",
        "count": waiting_count,
        "chats": waiting_chats,
    })

    try:
        while True:
            await ws.receive_text()   # keep-alive ping
    except WebSocketDisconnect:
        manager.disconnect(ws, "notify_agents", user_id)


@router.post("/new")
async def create_chat(data: NewChatRequest):
    now = datetime.utcnow().isoformat()

    # 1. Create lead
    lead_result = await leads_col.insert_one({
        "customer":    data.customer,
        "email":       data.email,
        "phone":       data.phone,
        "location":    data.location,
        "printer":     data.printer,
        "issue":       data.issue,
        "status":      "New",
        "assigned_to": None,
        "created_at":  now,
    })
    lead_id = str(lead_result.inserted_id)

    # 2. Create chat session
    chat_result = await chats_col.insert_one({
        "customer":   data.customer,
        "email":      data.email,
        "phone":      data.phone,
        "location":   data.location,
        "printer":    data.printer,
        "issue":      data.issue,
        "lead_id":    lead_id,
        "agent_id":   None,
        "status":     "waiting",
        "created_at": now,
    })
    chat_id = str(chat_result.inserted_id)

    # 3. Save chatbot conversation history
    if data.history:
        msg_docs = [
            {
                "chat_id":    chat_id,
                "sender":     msg.sender,
                "text":       msg.text,
                "created_at": msg.created_at or now,
                "is_history": True,
            }
            for msg in data.history
        ]
        await messages_col.insert_many(msg_docs)
    else:
        await messages_col.insert_one({
            "chat_id":    chat_id,
            "sender":     "bot",
            "text":       (
                f"Customer reported: {data.issue}. "
                f"Printer: {data.printer}. "
                f"Location: {data.location or 'not provided'}."
            ),
            "created_at": now,
            "is_history": True,
        })

    # 4. Notify all online agents
    await manager.notify_all_agents({
        "event": "new_chat_request",
        "chat": {
            "id":         chat_id,
            "customer":   data.customer,
            "email":      data.email,
            "phone":      data.phone,
            "location":   data.location,
            "printer":    data.printer,
            "issue":      data.issue,
            "status":     "waiting",
            "created_at": now,
        },
    })

    return {"chat_id": chat_id, "lead_id": lead_id}


@router.post("/agent/{chat_id}/accept")
async def accept_chat(chat_id: str, agent_id: str):
    await chats_col.update_one(
        {"_id": ObjectId(chat_id)},
        {"$set": {"status": "active", "agent_id": agent_id}},
    )
    await leads_col.update_one(
        {"_id": ObjectId(chat_id)},
        {"$set": {"assigned_to": agent_id}},
    )
    await manager.broadcast(f"chat_{chat_id}", {
        "event":    "chat_accepted",
        "chat_id":  chat_id,
        "agent_id": agent_id,
    })
    return {"success": True}


@router.post("/agent/{chat_id}/resolve")
async def resolve_chat(chat_id: str):
    chat_doc = await chats_col.find_one({"_id": ObjectId(chat_id)})
    await chats_col.update_one(
        {"_id": ObjectId(chat_id)},
        {"$set": {"status": "resolved"}},
    )
    if chat_doc and chat_doc.get("lead_id"):
        await leads_col.update_one(
            {"_id": ObjectId(chat_doc["lead_id"])},
            {"$set": {"status": "Resolved"}},
        )
    await manager.broadcast(f"chat_{chat_id}", {
        "event":   "chat_resolved",
        "chat_id": chat_id,
    })
    return {"success": True}


@router.get("/{chat_id}/messages")
async def get_messages(chat_id: str):
    cursor = messages_col.find({"chat_id": chat_id}).sort("created_at", 1)
    msgs   = [fix_id(m) async for m in cursor]
    return {"messages": msgs}


@router.get("/{chat_id}")
async def get_chat(chat_id: str):
    chat = await chats_col.find_one({"_id": ObjectId(chat_id)})
    if not chat:
        raise HTTPException(404, "Chat not found")
    return fix_id(chat)