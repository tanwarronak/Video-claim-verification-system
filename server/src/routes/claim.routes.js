import { Router } from "express";
import { ClaimController } from "../controllers/claim.controller.js";

const router = Router();

// POST /api/claims/extract
router.post("/extract", ClaimController.extractClaims);

export default router;
