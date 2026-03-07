# main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from auth import router as auth_router
from routers.admin import router as admin_router
from routers.agent import router as agent_router
from routers.chat  import router as chat_router

app = FastAPI(title='TechForCall API', version='2.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
        'http://localhost:3000',
        'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:5175',
    ],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth_router,  prefix='/api/auth',  tags=['Auth'])
app.include_router(admin_router, prefix='/api/admin', tags=['Admin'])
app.include_router(agent_router, prefix='/api/agent', tags=['Agent'])
app.include_router(chat_router,  prefix='/api/chats', tags=['Chats'])

@app.get('/')
async def root():
    return {'status': 'TechForCall API running', 'version': '2.0.0'}

# Run: uvicorn main:app --reload --host 0.0.0.0 --port 8000
