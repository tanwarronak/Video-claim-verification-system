import { Router } from "express";
import { EvidenceController } from "../controllers/evidence.controller.js";

const router = Router();

// POST /api/evidence/retrieve
router.post("/retrieve", EvidenceController.retrieveEvidence);

export default router;