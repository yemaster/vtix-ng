from typing import Union

from fastapi import FastAPI

from routers import users

app = FastAPI()

app.include_router(users.router)

@app.get("/")
def read_root():
    return {
        "app": "vtix-ng",
        "version": "0.1.0",
        "author": ["yemaster", "XeF2"],
    }