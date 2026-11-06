import { Router } from "express";
import { NliController } from "../controllers/nli.controller.js";

const router = Router();

// POST /api/nli/verify
router.post("/verify", NliController.verifyClaims);

export default router;