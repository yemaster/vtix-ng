from fastapi import APIRouter

router = APIRouter(
    prefix="/users",
    tags=["users"],
    responses={404: {"code": 404, "msg": "Not found"}},
)

@router.get("/{user_id}")
def read_user(user_id: int):
    return {"user_id": user_id}