from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Dict, Any
from models import User, Subtask, Task

router = APIRouter(prefix="/api/rewards", tags=["rewards"])

@router.post("/complete-subtask/{subtask_id}")
async def check_off_subtask(subtask_id: str):
    subtask = await Subtask.get(subtask_id)
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
        
    if subtask.completed:
        return {"status": "success", "message": "Already completed"}
        
    subtask.completed = True
    await subtask.save()
    
    # Normally fetch the real user
    user = await User.find_one({"email": "test@demo.com"})
    if not user:
        user = User(email="test@demo.com")
        
    user.reward_points += subtask.reward_value
    user.grace_passes = user.reward_points // 100
    await user.save()
    
    return {
        "status": "success",
        "subtask_id": subtask_id,
        "message": f"+{subtask.reward_value} points! You now have {user.reward_points} total."
    }

@router.get("/status/{user_email}")
async def get_user_rewards(user_email: str):
    user = await User.find_one({"email": user_email})
    if not user:
        return {"reward_points": 0, "grace_passes": 0}
        
    return {
        "reward_points": user.reward_points,
        "grace_passes": user.grace_passes
    }
