"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kbRouter = void 0;
const express_1 = require("express");
const aiClient_1 = require("../services/aiClient");
exports.kbRouter = (0, express_1.Router)();
/**
 * POST /api/kb/reingest
 * Trigger re-chunking and re-embedding of docs in the Python AI service
 */
exports.kbRouter.post('/reingest', async (_req, res) => {
    try {
        const result = await aiClient_1.aiClient.reingestKb();
        res.json({
            message: 'Knowledge base re-ingested successfully',
            ...result,
        });
    }
    catch (err) {
        console.error('Error in POST /api/kb/reingest:', err);
        res.status(500).json({
            error: 'Failed to re-ingest knowledge base',
            details: err?.message,
        });
    }
});
