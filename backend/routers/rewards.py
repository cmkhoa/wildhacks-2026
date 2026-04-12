"""
Rewards Router — Gamified motivation system.
Tracks points for completed subtasks and grants grace passes.
"""
from fastapi import APIRouter, HTTPException
from models import User, Subtask

router = APIRouter(prefix="/api/rewards", tags=["rewards"])

POINTS_PER_GRACE_PASS = 100


@router.post("/complete-subtask/{subtask_id}")
async def check_off_subtask(subtask_id: str, email: str = ""):
    """Mark a subtask as completed, award points, check for grace passes."""
    try:
        subtask = await Subtask.get(subtask_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Subtask not found")

    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")

    if subtask.completed:
        return {"status": "already_completed", "message": "This subtask is already done!"}

    subtask.completed = True
    await subtask.save()

    # Award points to user
    points_earned = subtask.reward_value
    user = None

    if email:
        user = await User.find_one({"email": email})

    if user:
        user.reward_points += points_earned
        new_passes = user.reward_points // POINTS_PER_GRACE_PASS
        earned_new_pass = new_passes > user.grace_passes
        user.grace_passes = new_passes
        await user.save()

        message = f"🎉 +{points_earned} pts! Total: {user.reward_points}"
        if earned_new_pass:
            message += f" 🏆 You earned a Grace Pass! ({user.grace_passes} total)"

        return {
            "status": "success",
            "points_earned": points_earned,
            "total_points": user.reward_points,
            "grace_passes": user.grace_passes,
            "new_pass_earned": earned_new_pass,
            "message": message,
        }

    return {
        "status": "success",
        "points_earned": points_earned,
        "message": f"🎉 +{points_earned} pts! (Log in to track your total)",
    }


@router.post("/use-grace-pass")
async def use_grace_pass(email: str = ""):
    """Use a grace pass to skip/postpone a task without penalty."""
    if not email:
        raise HTTPException(status_code=400, detail="Email required")

    user = await User.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.grace_passes <= 0:
        raise HTTPException(status_code=400, detail="No grace passes available!")

    user.grace_passes -= 1
    await user.save()

    return {
        "status": "success",
        "remaining_passes": user.grace_passes,
        "message": f"Grace pass used! {user.grace_passes} remaining.",
    }


@router.get("/status")
async def get_user_rewards(email: str = ""):
    """Returns the current points, grace passes, and deviation ratio."""
    if not email:
        return {"reward_points": 0, "grace_passes": 0, "time_deviation_ratio": 1.5}

    try:
        user = await User.find_one({"email": email})
        if not user:
            return {"reward_points": 0, "grace_passes": 0, "time_deviation_ratio": 1.5}

        return {
            "reward_points": user.reward_points,
            "grace_passes": user.grace_passes,
            "time_deviation_ratio": user.time_deviation_ratio,
            "deviation_samples": user.deviation_samples,
        }
    except Exception:
        return {"reward_points": 0, "grace_passes": 0, "time_deviation_ratio": 1.5}
