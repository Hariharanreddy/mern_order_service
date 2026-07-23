import express from "express";
import authenticate from "../common/middleware/authenticate";
import { asyncWrapper } from "../utils";
import { CouponController } from "./couponController";

const router = express.Router();
const couponController = new CouponController();
router.post("/", authenticate, asyncWrapper(couponController.create));
router.get("/", authenticate, asyncWrapper(couponController.getAll));
router.get("/:id", authenticate, asyncWrapper(couponController.getOne));
router.patch("/:id", authenticate, asyncWrapper(couponController.update));
router.delete("/:id", authenticate, asyncWrapper(couponController.delete));
router.post("/verify", authenticate, asyncWrapper(couponController.verify));

export default router;
